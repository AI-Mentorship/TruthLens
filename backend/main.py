from fastapi import FastAPI, HTTPException # import FastAPI
from fastapi.middleware.cors import CORSMiddleware # handle CORS
from pydantic import BaseModel # validate data
import requests # use external API
import re # process text
from bs4 import BeautifulSoup # scrape web
import urllib.parse # parse URL
import json # handle JSON
import time # delay
import asyncio # async process
import queue # queue processing
import threading # process thread

api_call_count = 0
api_call_limit = 100 # limit API calls
last_reset_time = time.time()

analysis_queue = queue.Queue()
processing_lock = threading.Lock()
is_processing = False
completed_results = {} # store results

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_link = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

api_private_key = "AIzaSyAvY4f9tujO2ns1-CQwOX3Sp9ognGlhlSk"

def check_rate_limit():
    """Check if we've exceeded the API call limit"""
    global api_call_count, last_reset_time
    
    if time.time() - last_reset_time > 3600: # reset every hour
        api_call_count = 0
        last_reset_time = time.time()
        print(f"Rate limit counter reset. Current count: {api_call_count}")
    
    if api_call_count >= api_call_limit:
        print(f"Rate limit exceeded: {api_call_count}/{api_call_limit}")
        return False
    
    return True

def increment_api_count():
    """Increment the API call counter"""
    global api_call_count
    api_call_count += 1
    print(f"API call count: {api_call_count}/{api_call_limit}")

def process_analysis_queue():
    """Background worker to process analysis queue sequentially"""
    global is_processing
    
    while True:
        try:
            item = analysis_queue.get(timeout=1) # get item
            
            with processing_lock:
                is_processing = True
            
            print(f"🔄 Processing analysis #{item['id']} - {item['product_data'].title[:50]}...")
            
            result = analyze_product_with_ai(item['product_data'])
            
            completed_results[item['id']] = {
                'result': result,
                'completed': True,
                'timestamp': time.time()
            }
            
            print(f"✅ Completed analysis #{item['id']}")
            
            analysis_queue.task_done()
            
            time.sleep(2) # delay between analyses
            
        except queue.Empty:
            with processing_lock:
                if analysis_queue.empty():
                    is_processing = False
            continue
        except Exception as e:
            print(f"❌ Error processing analysis: {e}")
            with processing_lock:
                is_processing = False
            continue

def add_to_analysis_queue(product_data: ProductAnalysis) -> str:
    """Add product analysis to queue and return analysis ID"""
    analysis_id = f"analysis_{int(time.time() * 1000)}"
    
    queue_item = {
        'id': analysis_id,
        'product_data': product_data,
        'result': None,
        'completed': False,
        'timestamp': time.time()
    }
    
    analysis_queue.put(queue_item)
    print(f"📝 Added analysis #{analysis_id} to queue (Queue size: {analysis_queue.qsize()})")
    
    return analysis_id

def cleanup_old_results():
    """Clean up old completed results to prevent memory issues"""
    current_time = time.time()
    old_keys = []
    
    for analysis_id, result_data in completed_results.items():
        if current_time - result_data['timestamp'] > 3600: # remove old results
            old_keys.append(analysis_id)
    
    for key in old_keys:
        del completed_results[key]
    
    if old_keys:
        print(f"🧹 Cleaned up {len(old_keys)} old analysis results")

def get_analysis_result(analysis_id: str) -> dict:
    """Get analysis result by ID"""
    cleanup_old_results()
    
    if analysis_id in completed_results: # check if completed
        result_data = completed_results[analysis_id]
        return {
            'success': True,
            'analysis': result_data['result'],
            'status': 'completed'
        }
    
    try:
        queue_items = list(analysis_queue.queue) # check queue
        for item in queue_items:
            if item['id'] == analysis_id:
                return {
                    'success': False,
                    'message': 'Analysis in progress...',
                    'status': 'processing'
                }
    except Exception as e:
        print(f"⚠️ Error checking queue: {e}")
    
    with processing_lock:
        if is_processing: # check if processing
            return {
                'success': False,
                'message': 'Analysis in progress...',
                'status': 'processing'
            }
    
    return {
        'success': False,
        'message': 'Analysis not found or not started',
        'status': 'not_found'
    }

class TextFromFrontEnd(BaseModel):
   text: str

class ProductAnalysis(BaseModel):
    title: str
    description: str = ""
    price: str = ""
    seller: str = ""
    rating: str = ""
    reviews_count: str = ""
    url: str = ""
    image_url: str = ""

class ProductURL(BaseModel):
    url: str

class ProductAnalysisResult(BaseModel):
    ai_score: float # score scale
    review_bonus: bool # bonus flag
    final_score: float # final score
    status: str # status
    conclusion: str # conclusion
    analysis_details: dict # details

@app.post("/check-text")
def check_ai_text(item: TextFromFrontEnd):
   if not check_rate_limit(): # check limit
       return {
           "success": False,
           "error": "Rate limit exceeded",
           "ai_score": 0.5,
           "confidence": 0.0,
           "analysis": "Rate limit exceeded - too many API calls"
       }
   
   url = api_link
   
   headers = {
       'Content-Type': 'application/json',
       'x-goog-api-key': api_private_key
   }
   
   dataSent = {
       "contents": [{
           "parts": [{
               "text": f"Analyze this text for AI generation probability (0-1 scale): {item.text}"
           }]
       }]
   }

   try: 
       time.sleep(0.5) # delay
       increment_api_count() # increment count
       response = requests.post(url, headers=headers, json=dataSent)
       response.raise_for_status()
       result = response.json()
       
       if 'candidates' in result and len(result['candidates']) > 0: # extract text
           ai_text = result['candidates'][0]['content']['parts'][0]['text']
           import re
           prob_match = re.search(r'(\d+\.?\d*)', ai_text)
           probability = float(prob_match.group(1)) if prob_match else 0.5
           return {"score": probability / 100 if probability > 1 else probability}
       else:
           return {"score": 0.5}
           
   except requests.exceptions.RequestException as e:
       raise HTTPException(status_code=500, detail=f"API error: {str(e)}")
  
def extract_product_info(url: str) -> dict:
    """
    Extract product information from a given URL
    Returns: dict with title, description, price, seller, rating, reviews_count
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        product_info = {
            'title': '',
            'description': '',
            'price': '',
            'seller': '',
            'rating': '',
            'reviews_count': '',
            'url': url
        }
        
        title_selectors = [
            'h1', 'h2', '.product-title', '.product-name', 
            '[data-testid="product-title"]', '.title', '.productTitle'
        ]
        for selector in title_selectors: # extract title
            title_elem = soup.select_one(selector)
            if title_elem and title_elem.get_text(strip=True):
                product_info['title'] = title_elem.get_text(strip=True)
                break
        
        desc_selectors = [
            '.product-description', '.description', '.product-details',
            '[data-testid="product-description"]', '.product-info', '.details'
        ]
        for selector in desc_selectors: # extract description
            desc_elem = soup.select_one(selector)
            if desc_elem:
                product_info['description'] = desc_elem.get_text(strip=True)[:500]
                break
        
        price_selectors = [
            '.price', '.product-price', '[data-testid="price"]',
            '.cost', '.amount', '.value', '.price-current'
        ]
        for selector in price_selectors: # extract price
            price_elem = soup.select_one(selector)
            if price_elem:
                price_text = price_elem.get_text(strip=True)
                if '$' in price_text or '€' in price_text or '£' in price_text:
                    product_info['price'] = price_text
                    break
        
        rating_selectors = [
            '.rating', '.stars', '.score', '[data-testid="rating"]',
            '.review-rating', '.product-rating'
        ]
        for selector in rating_selectors: # extract rating
            rating_elem = soup.select_one(selector)
            if rating_elem:
                rating_text = rating_elem.get_text(strip=True)
                rating_match = re.search(r'(\d+\.?\d*)\s*(?:out of|/|\s*stars?)', rating_text, re.IGNORECASE)
                if rating_match:
                    product_info['rating'] = rating_match.group(1)
                    break
        
        reviews_selectors = [
            '.reviews-count', '.review-count', '[data-testid="reviews-count"]',
            '.num-reviews', '.review-total'
        ]
        for selector in reviews_selectors: # extract reviews
            reviews_elem = soup.select_one(selector)
            if reviews_elem:
                reviews_text = reviews_elem.get_text(strip=True)
                reviews_match = re.search(r'(\d+(?:,\d+)*)', reviews_text)
                if reviews_match:
                    product_info['reviews_count'] = reviews_match.group(1)
                    break
        
        domain = urllib.parse.urlparse(url).netloc
        if 'amazon' in domain.lower(): # extract seller
            product_info['seller'] = 'Amazon'
        elif 'walmart' in domain.lower():
            product_info['seller'] = 'Walmart'
        elif 'target' in domain.lower():
            product_info['seller'] = 'Target'
        elif 'ebay' in domain.lower():
            product_info['seller'] = 'eBay'
        else:
            product_info['seller'] = domain
        
        return product_info
        
    except Exception as e:
        return {
            'title': 'Unable to extract',
            'description': '',
            'price': '',
            'seller': '',
            'rating': '',
            'reviews_count': '',
            'url': url,
            'error': str(e)
        }

def analyze_image_ai(image_url: str) -> float:
    """
    Analyze image to detect AI generation probability using Gemini Vision API
    Returns: float between 0-1 where higher means more likely AI-generated
    """
    if not image_url or image_url == "":
        return 0.0
    
    try:
        url = api_link
        
        headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': api_private_key
        }
        
        import base64
        import requests as req
        
        img_response = req.get(image_url, timeout=10) # download image
        img_response.raise_for_status()
        img_data = base64.b64encode(img_response.content).decode('utf-8') # encode image
        
        data_sent = {
            "contents": [{
                "parts": [
                    {"text": "Analyze if this image is AI-generated. Return ONLY a number 0.0-1.0 (0.8+=AI-generated, 0.4-0.7=uncertain, 0.0-0.3=real). Number only."},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": img_data
                        }
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0.1, # low temperature for deterministic results
                "topK": 1,
                "topP": 0.1
            }
        }
        
        time.sleep(0.5) # delay
        ai_response = req.post(api_link, headers=headers, json=data_sent, timeout=30)
        ai_response.raise_for_status()
        ai_result = ai_response.json()
        
        if 'candidates' in ai_result and len(ai_result['candidates']) > 0: # extract score
            ai_text = ai_result['candidates'][0]['content']['parts'][0]['text']
            import re
            prob_match = re.search(r'(\d+\.?\d*)', ai_text)
            if prob_match:
                ai_score = float(prob_match.group(1))
                if ai_score > 1: # normalize score
                    ai_score = ai_score / 100
                # Round to nearest 0.05 for consistency
                ai_score = round(ai_score * 20) / 20
                return ai_score
        
        return 0.5
        
    except Exception as e:
        print(f"Image analysis error: {e}")
        return 0.0

def analyze_product_with_ai(product_data: ProductAnalysis) -> dict:
    """
    Analyze product using AI with percentage-based scoring system
    Returns comprehensive analysis with final conclusion
    """
    try:
        if not check_rate_limit(): # check limit
            print("Rate limit exceeded, using fallback analysis")
            return analyze_product_fallback(product_data)
        
        combined_text = f"Title: {product_data.title}\nDescription: {product_data.description}\nPrice: {product_data.price}\nSeller: {product_data.seller}"
        
        url = api_link
        
        headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': api_private_key
        }
        
        data_sent = {
            "contents": [{
                "parts": [{
                    "text": f"Analyze this product authenticity. Return ONLY a number between 0.0-1.0 for AI generation probability (0.8+=scam, 0.4-0.7=uncertain, 0.0-0.3=legitimate). Format: ONLY number, nothing else.\n\nProduct: {combined_text}\n\nProbability (0-1):"
                }]
            }],
            "generationConfig": {
                "temperature": 0.1, # low temperature for deterministic results
                "topK": 1,
                "topP": 0.1
            }
        }
        
        time.sleep(0.5) # delay
        increment_api_count() # increment
        ai_response = requests.post(url, headers=headers, json=data_sent, timeout=30)
        ai_response.raise_for_status()
        ai_result = ai_response.json()
        
        text_ai_score_raw = 0.5 # default score
        if 'candidates' in ai_result and len(ai_result['candidates']) > 0:
            ai_text = ai_result['candidates'][0]['content']['parts'][0]['text']
            import re
            prob_match = re.search(r'(\d+\.?\d*)', ai_text)
            if prob_match: # parse response
                text_ai_score_raw = float(prob_match.group(1))
                if text_ai_score_raw > 1:
                    text_ai_score_raw = text_ai_score_raw / 100
                # Round to nearest 0.05 for consistency
                text_ai_score_raw = round(text_ai_score_raw * 20) / 20
            else: # analyze sentiment
                if 'scam' in ai_text.lower() or 'fake' in ai_text.lower() or 'suspicious' in ai_text.lower():
                    text_ai_score_raw = 0.8
                elif 'legitimate' in ai_text.lower() or 'genuine' in ai_text.lower() or 'real' in ai_text.lower():
                    text_ai_score_raw = 0.2
                else:
                    text_ai_score_raw = 0.5
        
        image_ai_score_raw = 0.0
        if product_data.image_url and product_data.image_url != "": # analyze image
            print(f"Analyzing image: {product_data.image_url}")
            image_ai_score_raw = analyze_image_ai(product_data.image_url)
        
        if image_ai_score_raw > 0: # average scores
            ai_score_raw = (text_ai_score_raw + image_ai_score_raw) / 2.0
            print(f"Text AI: {text_ai_score_raw:.2f}, Image AI: {image_ai_score_raw:.2f}, Average: {ai_score_raw:.2f}")
        else:
            ai_score_raw = text_ai_score_raw
        
        text_ai_percentage = round(text_ai_score_raw * 100, 1) # calculate percentages
        image_ai_percentage = round(image_ai_score_raw * 100, 1)
        
        legitimacy_percentage = max(10, min(90, 100 - (ai_score_raw * 80))) # convert score
        
        review_bonus = False
        reviews_count = 0
        rating_value = 0
        
        if product_data.reviews_count: # parse reviews
            try:
                reviews_match = re.search(r'[\d,]+', product_data.reviews_count.replace(',', ''))
                if reviews_match:
                    reviews_count = int(reviews_match.group())
            except:
                pass
        
        if product_data.rating: # parse rating
            try:
                rating_value = float(product_data.rating)
            except:
                pass
        
        if reviews_count >= 50 and rating_value >= 4.5: # apply bonus
            review_bonus = True
            final_legitimacy_percentage = min(95, legitimacy_percentage + 10)
        else:
            final_legitimacy_percentage = legitimacy_percentage
        
        if final_legitimacy_percentage >= 70: # determine status
            status = 'legit'
        elif final_legitimacy_percentage >= 40:
            status = 'uncertain'
        else:
            status = 'scam'
        
        scam_percentage = max(0, 100 - final_legitimacy_percentage) # calculate percentages
        legit_percentage = final_legitimacy_percentage
        uncertain_percentage = 100 - scam_percentage - legit_percentage
        
        conclusion_parts = []
        
        conclusion_parts.append(f"📊 AI Analysis Results:") # generate conclusion
        conclusion_parts.append(f"   • Text AI Generation: {text_ai_percentage}%")
        if image_ai_percentage > 0:
            conclusion_parts.append(f"   • Image AI Generation: {image_ai_percentage}%")
            avg_ai_percentage = round(((text_ai_score_raw + image_ai_score_raw) / 2.0) * 100, 1)
            conclusion_parts.append(f"   • Average AI Detection: {avg_ai_percentage}%")
        else:
            conclusion_parts.append(f"   • Image Analysis: Not available")
        conclusion_parts.append(f"   • Legitimacy Score: {final_legitimacy_percentage:.1f}%")
        
        conclusion_parts.append(f"\n⭐ Review Analysis:")
        if review_bonus:
            conclusion_parts.append(f"   • Review bonus applied: {reviews_count:,} reviews with {rating_value:.1f} rating (+10%)")
        elif reviews_count > 0:
            conclusion_parts.append(f"   • Reviews: {reviews_count:,} reviews with {rating_value:.1f} rating (no bonus - need 50+ reviews & 4.5+ rating)")
        else:
            conclusion_parts.append("   • No review data available")
        
        conclusion_parts.append(f"\n🎯 FINAL VERDICT:")
        if status == 'legit':
            conclusion_parts.append(f"   ✅ This product appears LEGITIMATE ({legit_percentage:.1f}% confidence)")
        elif status == 'uncertain':
            conclusion_parts.append(f"   ⚠️ This product is UNCERTAIN - proceed with caution ({uncertain_percentage:.1f}% uncertain)")
        else:
            conclusion_parts.append(f"   ❌ This product appears to be a SCAM ({scam_percentage:.1f}% scam risk)")
        
        conclusion = "\n".join(conclusion_parts)
        
        return {
            'legitimacy_percentage': final_legitimacy_percentage,
            'scam_percentage': scam_percentage,
            'legit_percentage': legit_percentage,
            'uncertain_percentage': uncertain_percentage,
            'review_bonus': review_bonus,
            'status': status,
            'conclusion': conclusion,
            'ai_percentages': {
                'text_ai_percentage': text_ai_percentage,
                'image_ai_percentage': image_ai_percentage,
                'average_ai_percentage': round(((text_ai_score_raw + image_ai_score_raw) / 2.0) * 100, 1) if image_ai_score_raw > 0 else text_ai_percentage
            },
            'analysis_details': {
                'ai_raw_result': ai_result,
                'reviews_count': reviews_count,
                'rating_value': rating_value,
                'product_info': {
                    'title': product_data.title,
                    'description': product_data.description[:200] + "..." if len(product_data.description) > 200 else product_data.description,
                    'price': product_data.price,
                    'seller': product_data.seller,
                    'url': product_data.url
                }
            }
        }
        
    except requests.exceptions.RequestException as e:
        return {
            'legitimacy_percentage': 50.0,  # Default middle percentage
            'scam_percentage': 25.0,
            'legit_percentage': 50.0,
            'uncertain_percentage': 25.0,
            'review_bonus': False,
            'status': 'uncertain',
            'conclusion': f"❌ Backend Connection Error: Unable to connect to AI analysis service.\nError: {str(e)}\n\n⚠️ FINAL VERDICT: This product is UNCERTAIN - unable to complete analysis",
            'ai_percentages': {
                'text_ai_percentage': 0.0,
                'image_ai_percentage': 0.0,
                'average_ai_percentage': 0.0
            },
            'analysis_details': {
                'error': str(e),
                'error_type': 'connection_error',
                'product_info': {
                    'title': product_data.title,
                    'url': product_data.url
                }
            }
        }
    except Exception as e:
        return {
            'legitimacy_percentage': 50.0,  # Default middle percentage
            'scam_percentage': 25.0,
            'legit_percentage': 50.0,
            'uncertain_percentage': 25.0,
            'review_bonus': False,
            'status': 'uncertain',
            'conclusion': f"❌ Analysis Error: {str(e)}\n\n⚠️ FINAL VERDICT: This product is UNCERTAIN - unable to complete analysis",
            'ai_percentages': {
                'text_ai_percentage': 0.0,
                'image_ai_percentage': 0.0,
                'average_ai_percentage': 0.0
            },
            'analysis_details': {
                'error': str(e),
                'error_type': 'analysis_error',
                'product_info': {
                    'title': product_data.title,
                    'url': product_data.url
                }
            }
        }

def analyze_product_fallback(product_data: ProductAnalysis) -> dict:
    """
    Fallback analysis using basic heuristics when AI service is unavailable
    """
    scam_indicators = 0
    legit_indicators = 0
    
    title_lower = product_data.title.lower()
    suspicious_words = ['urgent', 'limited time', 'act now', 'guaranteed', 'miracle', 'secret', 'exclusive offer', 'free money', 'get rich quick']
    if any(word in title_lower for word in suspicious_words): # analyze title
        scam_indicators += 1
    
    if product_data.price: # analyze price
        try:
            price_match = re.search(r'[\d,]+\.?\d*', product_data.price.replace('$', '').replace(',', ''))
            if price_match:
                price_value = float(price_match.group())
                if price_value < 1.0:
                    scam_indicators += 1
                elif price_value > 100:
                    legit_indicators += 1
        except:
            pass
    
    if product_data.seller: # analyze seller
        seller_lower = product_data.seller.lower()
        if 'amazon' in seller_lower or 'walmart' in seller_lower or 'target' in seller_lower:
            legit_indicators += 1
        elif len(seller_lower) < 3:
            scam_indicators += 1
    
    if product_data.rating: # analyze rating
        try:
            rating_value = float(product_data.rating)
            if rating_value < 2.0:
                scam_indicators += 1
            elif rating_value > 4.0:
                legit_indicators += 1
        except:
            pass
    
    total_indicators = scam_indicators + legit_indicators
    if total_indicators == 0:
        legitimacy_percentage = 50.0
    else:
        legitimacy_percentage = max(20, min(80, (legit_indicators / total_indicators) * 100))
    
    scam_percentage = max(0, 100 - legitimacy_percentage)
    legit_percentage = legitimacy_percentage
    uncertain_percentage = 0
    
    if legitimacy_percentage >= 70: # determine status
        status = 'legit'
    elif legitimacy_percentage >= 40:
        status = 'uncertain'
    else:
        status = 'scam'
    
    conclusion = f"📊 Fallback Analysis (AI Service Unavailable):\n   • Legitimacy Score: {legitimacy_percentage:.1f}%\n   • Analysis Method: Basic heuristics\n\n🎯 FINAL VERDICT:\n   {'✅ This product appears LEGITIMATE' if status == 'legit' else '⚠️ This product is UNCERTAIN - proceed with caution' if status == 'uncertain' else '❌ This product appears to be a SCAM'}"
    
    return {
        'legitimacy_percentage': legitimacy_percentage,
        'scam_percentage': scam_percentage,
        'legit_percentage': legit_percentage,
        'uncertain_percentage': uncertain_percentage,
        'review_bonus': False,
        'status': status,
        'conclusion': conclusion,
        'ai_percentages': {
            'text_ai_percentage': 0.0,
            'image_ai_percentage': 0.0,
            'average_ai_percentage': 0.0
        },
        'analysis_details': {
            'analysis_method': 'fallback_heuristics',
            'scam_indicators': scam_indicators,
            'legit_indicators': legit_indicators,
            'product_info': {
                'title': product_data.title,
                'description': product_data.description[:200] + "..." if len(product_data.description) > 200 else product_data.description,
                'price': product_data.price,
                'seller': product_data.seller,
                'url': product_data.url
            }
        }
    }

@app.post("/test-batch")
def test_batch_analysis(): # test batch
    """
    Test endpoint to verify batch analysis is working
    """
    try:
        test_product = ProductAnalysis(
            title="Test Product",
            description="This is a test product for debugging",
            price="$19.99",
            seller="Test Seller",
            rating="4.5",
            reviews_count="100",
            url="https://example.com/test"
        )
        
        result = analyze_product_with_ai(test_product)
        
        return {
            'success': True,
            'message': 'Batch analysis test successful',
            'test_result': result
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Test failed: {str(e)}'
        }

@app.get("/health")
def health_check(): # health check
    """
    Health check endpoint to verify backend is running and can connect to AI service
    """
    try:
        test_text = "This is a test message for health check"
        url = api_link
        
        headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': api_private_key
        }
        
        data_sent = {
            "contents": [{
                "parts": [{
                    "text": f"Respond with 'OK' if you can process this test: {test_text}"
                }]
            }]
        }
        
        time.sleep(0.5) # delay
        ai_response = requests.post(url, headers=headers, json=data_sent, timeout=10)
        ai_response.raise_for_status()
        ai_result = ai_response.json() # test API
        
        return {
            "status": "healthy",
            "backend": "running",
            "ai_service": "connected",
            "ai_response": ai_result,
            "timestamp": "2024-01-01T00:00:00Z"
        }
        
    except requests.exceptions.RequestException as e:
        return {
            "status": "unhealthy",
            "backend": "running",
            "ai_service": "disconnected",
            "error": str(e),
            "timestamp": "2024-01-01T00:00:00Z"
        }
    except Exception as e:
        return {
            "status": "error",
            "backend": "running",
            "ai_service": "unknown",
            "error": str(e),
            "timestamp": "2024-01-01T00:00:00Z"
        }

@app.post("/analyze-product")
def analyze_product(product_data: ProductAnalysis): # analyze product
    """
    Add product analysis to sequential processing queue
    """
    try:
        analysis_id = add_to_analysis_queue(product_data) # add to queue
        
        return {
            'success': True,
            'analysis_id': analysis_id,
            'message': 'Analysis queued for processing',
            'status': 'queued'
        }
        
    except Exception as e:
        print(f"Failed to queue analysis: {str(e)}")
        return {
            'success': False,
            'message': f'Failed to queue analysis: {str(e)}'
        }

@app.get("/analysis-result/{analysis_id}")
def get_analysis_result_endpoint(analysis_id: str):
    """
    Get analysis result by ID
    """
    try:
        result = get_analysis_result(analysis_id)
        return result
        
    except Exception as e:
        print(f"Failed to get analysis result: {str(e)}")
        return {
            'success': False,
            'message': f'Failed to get analysis result: {str(e)}'
        }

class BatchAnalysisRequest(BaseModel):
    products: list[ProductAnalysis]

@app.post("/analyze-products-batch")
def analyze_products_batch(batch_request: BatchAnalysisRequest): # analyze batch
    """
    Analyze multiple products in batch
    """
    try:
        print(f"📦 Received batch analysis request for {len(batch_request.products)} products")
        
        if not batch_request.products:
            return {
                'success': False,
                'error': 'No products provided for analysis',
                'results': []
            }
        
        results = []
        
        for i, product_data in enumerate(batch_request.products):
            try:
                print(f"🔄 Analyzing product {i+1}/{len(batch_request.products)}: {product_data.title[:50]}...")
                
                if not check_rate_limit(): # check limit
                    print(f"⚠️ Rate limit exceeded for product {i+1}")
                    results.append({
                        'success': False,
                        'error': 'Rate limit exceeded',
                        'analysis': analyze_product_fallback(product_data)
                    })
                    continue
                
                analysis_result = analyze_product_with_ai(product_data) # analyze product
                
                results.append({
                    'success': True,
                    'analysis': analysis_result
                })
                
                print(f"✅ Completed analysis for product {i+1}")
                
                if i < len(batch_request.products) - 1: # delay between analyses
                    time.sleep(1)
                    
            except Exception as e:
                print(f"❌ Error analyzing product {i+1}: {str(e)}")
                results.append({
                    'success': False,
                    'error': str(e),
                    'analysis': analyze_product_fallback(product_data)
                })
        
        print(f"📊 Batch analysis completed: {len([r for r in results if r['success']])} successful, {len([r for r in results if not r['success']])} failed")
        
        return {
            'success': True,
            'results': results,
            'total_analyzed': len(results),
            'successful': len([r for r in results if r['success']]),
            'failed': len([r for r in results if not r['success']])
        }
        
    except Exception as e:
        print(f"❌ Batch analysis error: {str(e)}")
        return {
            'success': False,
            'error': f'Batch analysis failed: {str(e)}',
            'results': []
        }

@app.post("/analyze-product-url")
def analyze_product_url(url_data: ProductURL): # analyze URL
    """
    Extract product information from URL and analyze for legitimacy
    """
    try:
        product_info = extract_product_info(url_data.url) # extract info
        
        if 'error' in product_info:
            return {
                'success': False,
                'error': f"Failed to extract product info: {product_info['error']}",
                'url': url_data.url
            }
        
        product_data = ProductAnalysis( # create data
            title=product_info['title'],
            description=product_info['description'],
            price=product_info['price'],
            seller=product_info['seller'],
            rating=product_info['rating'],
            reviews_count=product_info['reviews_count'],
            url=product_info['url']
        )
        
        analysis_result = analyze_product_with_ai(product_data) # analyze
        
        return {
            'success': True,
            'extracted_info': product_info,
            'analysis': analysis_result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"URL analysis error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 Starting TruthLens Backend Server...")
    print("🔄 Starting sequential analysis worker...")
    
    worker_thread = threading.Thread(target=process_analysis_queue, daemon=True) # start worker
    worker_thread.start()
    
    print("✅ Sequential analysis worker started")
    print("🌐 Server starting on http://localhost:8000")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)