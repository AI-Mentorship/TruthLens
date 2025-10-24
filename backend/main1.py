from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import re

app = FastAPI()

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API configuration
API_LINK = "https://api.sapling.ai/api/v1/aidetect"
API_KEY = "L5GO02U1QNW2WNTAGDUZV3Q705OPMUP6"

# Data models
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

# Routes
@app.get("/")
def root():
    return {"status": "active", "message": "TruthLens API"}

@app.post("/check-text")
def check_ai_text(item: TextFromFrontEnd):
    """Check if text is AI-generated"""
    headers = {"Authorization": f"Key {API_KEY}"}
    
    try:
        response = requests.post(API_LINK, headers=headers, json={"text": item.text})
        response.raise_for_status()
        return response.json()
    except:
        raise HTTPException(status_code=500, detail="AI analysis failed")

@app.post("/analyze-product")
def analyze_product(product: ProductAnalysis):
    """Simple product scam analysis"""
    scam_reasons = []
    legit_reasons = []
    
    # Check title for scam keywords
    title_lower = product.title.lower()
    scam_keywords = ['urgent', 'limited time', 'act now', 'guaranteed', 'miracle', 'secret']
    found_keywords = [word for word in scam_keywords if word in title_lower]
    if found_keywords:
        scam_reasons.append(f"Suspicious words: {', '.join(found_keywords)}")
    
    # Check price
    if product.price:
        try:
            price_num = float(re.sub(r'[^\d.]', '', product.price))
            if price_num < 5.0:
                scam_reasons.append(f"Very low price: ${price_num}")
            elif price_num > 50.0:
                legit_reasons.append("Reasonable price")
        except:
            pass
    
    # Check seller
    if product.seller:
        seller_lower = product.seller.lower()
        if any(store in seller_lower for store in ['amazon', 'walmart', 'target']):
            legit_reasons.append("Reputable seller")
        elif len(seller_lower) < 4:
            scam_reasons.append("Suspicious seller name")
    
    # Check rating
    if product.rating:
        try:
            rating = float(product.rating)
            if rating < 2.0:
                scam_reasons.append(f"Low rating: {rating}")
            elif rating > 4.0:
                legit_reasons.append(f"Good rating: {rating}")
        except:
            pass
    
    # Check reviews count
    if product.reviews_count:
        try:
            reviews = int(re.sub(r'[^\d]', '', product.reviews_count))
            if reviews < 10:
                scam_reasons.append(f"Few reviews: {reviews}")
            elif reviews > 100:
                legit_reasons.append(f"Many reviews: {reviews}")
        except:
            pass
    
    # Determine result
    if scam_reasons and not legit_reasons:
        status = "high_risk"
    elif scam_reasons and legit_reasons:
        status = "medium_risk" 
    else:
        status = "low_risk"
    
    confidence = min(0.95, 0.5 + (len(scam_reasons + legit_reasons) * 0.1))
    
    return {
        "status": status,
        "confidence": round(confidence, 2),
        "scam_reasons": scam_reasons,
        "legit_reasons": legit_reasons,
        "product_info": {
            "title": product.title,
            "price": product.price,
            "seller": product.seller
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)