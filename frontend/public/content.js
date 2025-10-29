// Content script: on/off persisted state and product analysis with backend integration
(function () {
    'use strict';

    const STORAGE_ACTIVE_KEY = 'truthlens_active';
    const STORAGE_STATUS_KEY = 'truthlens_status';
    const STORAGE_ANALYSIS_KEY = 'truthlens_analysis';
    const API_BASE_URL = 'http://localhost:8000';
    
    let isActive = true;
    let currentStatus = 'uncertain';
    let processedProducts = new WeakSet();
    let mutationObserver = null;
    let analysisCache = new Map(); // Cache analysis results
    let analysisCount = 0; // Counter for API calls
    const MAX_ANALYSIS_LIMIT = 100; // Maximum products to analyze
    
    // Load persistent cache from localStorage
    function loadCache() {
        try {
            const cached = localStorage.getItem('truthlens_analysis_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                parsed.forEach(([key, value]) => {
                    analysisCache.set(key, value);
                });
                console.log(`TruthLens: Loaded ${analysisCache.size} cached analyses`);
            }
        } catch (error) {
            console.error('TruthLens: Error loading cache:', error);
        }
    }
    
    // Save cache to localStorage
    function saveCache() {
        try {
            const entries = Array.from(analysisCache.entries());
            localStorage.setItem('truthlens_analysis_cache', JSON.stringify(entries));
        } catch (error) {
            console.error('TruthLens: Error saving cache:', error);
        }
    }
    
    // Load cache on initialization
    loadCache();

    const siteConfigs = {
        'amazon': {
            productSelectors: [
                '[data-component-type="s-search-result"]',
                '[data-asin]',
                '.s-result-item',
                '.s-widget-container',
                '.s-search-result'
            ]
        },
        'walmart': {
            productSelectors: [
                '[data-item-id]',
                '.search-result-gridview-item',
                '.search-result-gridview-item-wrapper',
                '[data-testid="item-stack"]',
                '.product-tile',
                '.product-tile-wrapper',
                '[data-automation-id="product-tile"]'
            ]
        },
        'ebay': {
            productSelectors: [
                "[data-viewport]",
                '.s-item',
                '.s-item__wrapper'
            ]
        },
        'target': {
            productSelectors: [
                '[data-test="product-details"]',
                '.styles__ProductCardContainer'
            ]
        },
        'bestbuy': {
            productSelectors: [
                '.product-item',
                '.sku-item'
            ]
        }
    };

    function getCurrentSite() {
        const hostname = window.location.hostname.toLowerCase();
        if (hostname.includes('amazon')) return 'amazon';
        if (hostname.includes('walmart')) return 'walmart';
        if (hostname.includes('ebay')) return 'ebay';
        if (hostname.includes('target')) return 'target';
        if (hostname.includes('bestbuy')) return 'bestbuy';
        return 'default';
    }

    // Extract image from product element
    function extractProductImage(element) {
        const imageSelectors = ['img', 'picture img', '.product-image img', '[data-image]', '.main-image img', '.product-img img'];
        for (const selector of imageSelectors) {
            const img = element.querySelector(selector);
            if (img && img.src && !img.src.includes('placeholder') && !img.src.includes('loading')) {
                return img.src;
            }
        }
        return '';
    }

    // Extract product data from different e-commerce sites
    function extractProductData(element, site) {
        const data = {
            title: '',
            description: '',
            price: '',
            seller: '',
            rating: '',
            reviews_count: '',
            url: window.location.href,
            image_url: extractProductImage(element)
        };

        try {
            switch (site) {
                case 'amazon':
                    // Amazon-specific selectors
                    const titleEl = element.querySelector('h2 a span, .s-size-mini .a-link-normal span, [data-cy="title-recipe-title"] span');
                    if (titleEl) data.title = titleEl.textContent.trim();

                    const priceEl = element.querySelector('.a-price-whole, .a-price .a-offscreen, .a-price-range');
                    if (priceEl) data.price = priceEl.textContent.trim();

                    const ratingEl = element.querySelector('.a-icon-alt, .a-star-mini .a-icon-alt');
                    if (ratingEl) data.rating = ratingEl.textContent.match(/(\d+\.?\d*)/)?.[1] || '';

                    const reviewsEl = element.querySelector('a[href*="reviews"] span, .a-size-base');
                    if (reviewsEl) data.reviews_count = reviewsEl.textContent.trim();

                    const sellerEl = element.querySelector('.a-size-base-plus, .a-color-secondary');
                    if (sellerEl) data.seller = sellerEl.textContent.trim();
                    break;

                case 'walmart':
                    // Walmart title selectors - try multiple options
                    const walmartTitleSelectors = [
                        '[data-automation-id="product-title"]',
                        '.search-result-product-title',
                        '[data-testid="product-title"]',
                        '.product-title',
                        'h3',
                        'h2',
                        '.product-name'
                    ];
                    for (const selector of walmartTitleSelectors) {
                        const titleEl = element.querySelector(selector);
                        if (titleEl && titleEl.textContent.trim()) {
                            data.title = titleEl.textContent.trim();
                            break;
                        }
                    }

                    // Walmart price selectors
                    const walmartPriceSelectors = [
                        '.price-current',
                        '.price-main',
                        '[data-testid="price"]',
                        '.price',
                        '.price-display',
                        '[data-automation-id="price"]'
                    ];
                    for (const selector of walmartPriceSelectors) {
                        const priceEl = element.querySelector(selector);
                        if (priceEl && priceEl.textContent.trim()) {
                            data.price = priceEl.textContent.trim();
                            break;
                        }
                    }

                    // Walmart rating selectors
                    const walmartRatingSelectors = [
                        '.stars-container .stars-small',
                        '[data-testid="rating"]',
                        '.rating',
                        '.stars',
                        '[aria-label*="star"]'
                    ];
                    for (const selector of walmartRatingSelectors) {
                        const ratingEl = element.querySelector(selector);
                        if (ratingEl) {
                            const ratingText = ratingEl.getAttribute('aria-label') || ratingEl.textContent;
                            const match = ratingText.match(/(\d+\.?\d*)/);
                            if (match) {
                                data.rating = match[1];
                                break;
                            }
                        }
                    }

                    // Walmart reviews selectors
                    const walmartReviewsSelectors = [
                        '.stars-reviews-count',
                        '[data-testid="reviews-count"]',
                        '.reviews-count',
                        '.review-count'
                    ];
                    for (const selector of walmartReviewsSelectors) {
                        const reviewsEl = element.querySelector(selector);
                        if (reviewsEl && reviewsEl.textContent.trim()) {
                            data.reviews_count = reviewsEl.textContent.trim();
                            break;
                        }
                    }
                    break;

                case 'ebay':
                    const ebayTitle = element.querySelector('.s-item__title, .s-item__link');
                    if (ebayTitle) data.title = ebayTitle.textContent.trim();

                    const ebayPrice = element.querySelector('.s-item__price, .notranslate');
                    if (ebayPrice) data.price = ebayPrice.textContent.trim();

                    const ebayRating = element.querySelector('.s-item__reviews .clipped');
                    if (ebayRating) data.rating = ebayRating.textContent.match(/(\d+\.?\d*)/)?.[1] || '';

                    const ebaySeller = element.querySelector('.s-item__seller-info-text');
                    if (ebaySeller) data.seller = ebaySeller.textContent.trim();
                    break;

                case 'target':
                    const targetTitle = element.querySelector('[data-test="product-title"], .styles__ProductCardTitle');
                    if (targetTitle) data.title = targetTitle.textContent.trim();

                    const targetPrice = element.querySelector('[data-test="current-price"], .styles__PriceText');
                    if (targetPrice) data.price = targetPrice.textContent.trim();

                    const targetRating = element.querySelector('[data-test="rating"], .styles__RatingText');
                    if (targetRating) data.rating = targetRating.textContent.match(/(\d+\.?\d*)/)?.[1] || '';
                    break;

                case 'bestbuy':
                    const bestbuyTitle = element.querySelector('.product-title, .sku-title');
                    if (bestbuyTitle) data.title = bestbuyTitle.textContent.trim();

                    const bestbuyPrice = element.querySelector('.price-current, .price-main');
                    if (bestbuyPrice) data.price = bestbuyPrice.textContent.trim();

                    const bestbuyRating = element.querySelector('.rating, .stars');
                    if (bestbuyRating) data.rating = bestbuyRating.textContent.match(/(\d+\.?\d*)/)?.[1] || '';
                    break;

                default:
                    // Generic fallback selectors
                    const genericTitle = element.querySelector('h1, h2, h3, .title, .product-title, [class*="title"]');
                    if (genericTitle) data.title = genericTitle.textContent.trim();

                    const genericPrice = element.querySelector('.price, [class*="price"], [class*="cost"]');
                    if (genericPrice) data.price = genericPrice.textContent.trim();
                    break;
            }
        } catch (error) {
            console.error('Error extracting product data:', error);
        }

        return data;
    }

    // Send product data to backend for analysis
    async function analyzeProductWithBackend(productData) {
        // Create more robust cache key that includes image and URL
        const cacheKey = `${productData.title}_${productData.price}_${productData.image_url || 'no_image'}_${productData.url}`;
        
        // Check cache first - this ensures consistency
        if (analysisCache.has(cacheKey)) {
            const cachedResult = analysisCache.get(cacheKey);
            console.log('TruthLens: Using cached analysis for:', cacheKey.substring(0, 50));
            return cachedResult;
        }

        // Check if we've reached the analysis limit
        if (analysisCount >= MAX_ANALYSIS_LIMIT) {
            console.log(`TruthLens: Analysis limit reached (${MAX_ANALYSIS_LIMIT} products). Using fallback analysis.`);
            const limitReachedResult = {
                success: false,
                error: 'Analysis limit reached',
                analysis: {
                    status: 'uncertain',
                    legitimacy_percentage: 50.0,
                    scam_percentage: 25.0,
                    legit_percentage: 50.0,
                    uncertain_percentage: 25.0,
                    review_bonus: false,
                    conclusion: `⚠️ Analysis Limit Reached: Maximum ${MAX_ANALYSIS_LIMIT} products analyzed.\n\n🔄 To analyze more products, please refresh the page.\n\n⚠️ FINAL VERDICT: This product is UNCERTAIN - analysis limit reached`,
                    ai_percentages: {
                        text_ai_percentage: 0.0,
                        image_ai_percentage: 0.0,
                        average_ai_percentage: 0.0
                    },
                    analysis_details: {
                        error: 'Analysis limit reached',
                        error_type: 'limit_reached',
                        analysis_count: analysisCount,
                        max_limit: MAX_ANALYSIS_LIMIT
                    }
                }
            };
            
            // Cache limit result
            analysisCache.set(cacheKey, limitReachedResult);
            saveCache(); // persist to localStorage
            return limitReachedResult;
        }

        try {
            // Step 1: Queue the analysis
            console.log('TruthLens: Queuing product for analysis...');
            const queueResponse = await fetch(`${API_BASE_URL}/analyze-product`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(productData)
            });

            if (!queueResponse.ok) {
                throw new Error(`HTTP error! status: ${queueResponse.status}`);
            }

            const queueResult = await queueResponse.json();
            console.log('Analysis queued:', queueResult);
            
            if (!queueResult.success) {
                throw new Error(queueResult.message || 'Failed to queue analysis');
            }

            const analysisId = queueResult.analysis_id;
            
            // Step 2: Poll for results
            console.log(`TruthLens: Polling for analysis result (ID: ${analysisId})...`);
            let attempts = 0;
            const maxAttempts = 60; // 60 seconds timeout (increased for sequential processing)
            const pollInterval = 2000; // 2 seconds (increased to reduce server load)
            
            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                attempts++;
                
                try {
                    const resultResponse = await fetch(`${API_BASE_URL}/analysis-result/${analysisId}`);
                    
                    if (!resultResponse.ok) {
                        throw new Error(`HTTP error! status: ${resultResponse.status}`);
                    }
                    
                    const result = await resultResponse.json();
                    console.log(`Analysis poll attempt ${attempts}:`, result);
                    
                    if (result.success && result.status === 'completed') {
                        // Analysis completed successfully
                        analysisCount++;
                        console.log(`TruthLens: Analyzed ${analysisCount}/${MAX_ANALYSIS_LIMIT} products`);
                        
                        // Cache the result immediately to prevent re-polling
                        analysisCache.set(cacheKey, result);
                        saveCache(); // persist to localStorage
                        return result;
                    } else if (result.status === 'processing') {
                        // Still processing, continue polling
                        console.log(`TruthLens: Analysis still processing... (${attempts}/${maxAttempts})`);
                        continue;
                    } else if (result.status === 'not_found') {
                        // Analysis not found, might be queued but not started yet
                        console.log(`TruthLens: Analysis not found, might be queued... (${attempts}/${maxAttempts})`);
                        continue;
                    } else {
                        // Analysis failed
                        throw new Error(result.message || 'Analysis failed');
                    }
                    
                } catch (pollError) {
                    console.warn(`Poll attempt ${attempts} failed:`, pollError);
                    if (attempts >= maxAttempts) {
                        throw pollError;
                    }
                }
            }
            
            // Timeout reached
            throw new Error('Analysis timeout - taking too long to process');
            
        } catch (error) {
            console.error('Backend analysis failed:', error);
            // Return fallback analysis
            const fallbackResult = {
                success: false,
                error: error.message,
                analysis: {
                    status: 'uncertain',
                    legitimacy_percentage: 50.0,
                    scam_percentage: 25.0,
                    legit_percentage: 50.0,
                    uncertain_percentage: 25.0,
                    review_bonus: false,
                    conclusion: `❌ Backend Connection Error: Unable to connect to AI analysis service.\nError: ${error.message}\n\n⚠️ FINAL VERDICT: This product is UNCERTAIN - unable to complete analysis`,
                    ai_percentages: {
                        text_ai_percentage: 0.0,
                        image_ai_percentage: 0.0,
                        average_ai_percentage: 0.0
                    },
                    analysis_details: {
                        error: error.message,
                        error_type: 'connection_error'
                    }
                }
            };
            
            // Cache fallback result too
            analysisCache.set(cacheKey, fallbackResult);
            saveCache(); // persist to localStorage
            return fallbackResult;
        }
    }

    function removeAllIndicators() {
        document.querySelectorAll('[data-truthlens="true"]').forEach(node => node.remove());
        document.querySelectorAll('[data-truthlens-product="true"]').forEach(node => node.removeAttribute('data-truthlens-product'));
        document.querySelectorAll('[data-truthlens-analyze-btn]').forEach(node => node.remove());
        document.querySelectorAll('[data-truthlens-notification]').forEach(node => node.remove());
        document.querySelectorAll('[data-truthlens-info]').forEach(node => node.remove());
        // Reset processed set so re-enabling can re-mark items
        processedProducts = new WeakSet();
        // Reset analysis counter when clearing indicators
        analysisCount = 0;
        // Reset session stats when extension is turned off
        try {
            chrome.storage?.local?.set({ 
                truthlens_session_stats: {
                    legit: 0,
                    scam: 0,
                    uncertain: 0,
                    total_analyzed: 0,
                    website: window.location.hostname,
                    last_updated: Date.now()
                }
            });
            console.log('TruthLens: Session stats reset to 0');
        } catch (error) {
            console.error('Error resetting session stats:', error);
        }
        console.log('TruthLens: Analysis counter reset and indicators cleared');
    }

    function isProcessed(element) {
        if (processedProducts.has(element)) return true;
        if (element.closest('[data-truthlens-product="true"]')) return true;
        if (element.querySelector('[data-truthlens="true"]')) return true;
        return false;
    }

    function markProcessed(element) {
        try { element.setAttribute('data-truthlens-product', 'true'); } catch (_) { }
        processedProducts.add(element);
    }

    function getStyleForStatus(status) {
        switch (status) {
            case 'scam':
                return { bg: '#f44336', text: '✗', title: 'TruthLens: SCAM' };
            case 'uncertain':
                return { bg: '#ff9800', text: '...', title: 'TruthLens: UNCERTAIN' };
            default:
                return { bg: '#4CAF50', text: '✓', title: 'TruthLens: LEGIT' };
        }
    }

    function applyStatusToIndicator(indicator, status) {
        const s = getStyleForStatus(status);
        indicator.style.background = s.bg;
        indicator.textContent = s.text;
        indicator.title = s.title;
    }

    function createProductCheckbox(productData) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.setAttribute('data-truthlens', 'true');
        checkbox.setAttribute('data-truthlens-checkbox', 'true');
        checkbox.style.position = 'absolute';
        checkbox.style.top = '10px';
        checkbox.style.right = '10px';
        checkbox.style.width = '20px';
        checkbox.style.height = '20px';
        checkbox.style.zIndex = '9999';
        checkbox.style.cursor = 'pointer';
        checkbox.style.accentColor = '#4CAF50';
        
        // Store product data for analysis
        checkbox.productData = productData;
        
        // Debug: Log the extracted product data
        console.log('TruthLens: Extracted product data:', productData);
        
        return checkbox;
    }

    function addAnalyzeButton() {
        // Check if analyze button already exists
        if (document.querySelector('[data-truthlens-analyze-btn]')) return;
        
        const analyzeBtn = document.createElement('button');
        analyzeBtn.setAttribute('data-truthlens-analyze-btn', 'true');
        analyzeBtn.textContent = 'Analyze Selected Products';
        analyzeBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: all 0.3s ease;
        `;
        
        // Add hover effect
        analyzeBtn.addEventListener('mouseenter', () => {
            analyzeBtn.style.background = '#45a049';
            analyzeBtn.style.transform = 'translateY(-2px)';
        });
        
        analyzeBtn.addEventListener('mouseleave', () => {
            analyzeBtn.style.background = '#4CAF50';
            analyzeBtn.style.transform = 'translateY(0)';
        });
        
        analyzeBtn.addEventListener('click', async () => {
            await analyzeSelectedProducts();
        });
        
        document.body.appendChild(analyzeBtn);
    }

    async function analyzeSelectedProducts() {
        const selectedCheckboxes = document.querySelectorAll('[data-truthlens-checkbox]:checked');
        
        if (selectedCheckboxes.length === 0) {
            showNotification('Please select at least one product to analyze.', 'warning');
            return;
        }
        
        // Show loading state
        const analyzeBtn = document.querySelector('[data-truthlens-analyze-btn]');
        const originalText = analyzeBtn.textContent;
        analyzeBtn.textContent = `Analyzing ${selectedCheckboxes.length} products...`;
        analyzeBtn.disabled = true;
        analyzeBtn.style.background = '#ff9800';
        
        try {
            // Collect product data from selected checkboxes
            const productsToAnalyze = Array.from(selectedCheckboxes).map(checkbox => checkbox.productData);
            
            // Debug: Log what we're sending
            console.log('TruthLens: Products to analyze:', productsToAnalyze);
            
            // Validate product data before sending
            const validProducts = productsToAnalyze.filter(product => {
                const isValid = product && product.title && product.title.trim().length > 0;
                if (!isValid) {
                    console.warn('TruthLens: Invalid product data:', product);
                }
                return isValid;
            });
            
            if (validProducts.length === 0) {
                throw new Error('No valid products found to analyze. Please ensure products have titles.');
            }
            
            console.log(`TruthLens: Sending ${validProducts.length} valid products for analysis`);
            
            // Send batch analysis request to backend
            const analysisResults = await analyzeProductsBatch(validProducts);
            
            // Update UI with results
            updateProductsWithResults(selectedCheckboxes, analysisResults);
            
            // Cache batch results
            analysisResults.forEach((result, index) => {
                if (result && result.analysis && selectedCheckboxes[index]) {
                    const productData = selectedCheckboxes[index].productData;
                    const cacheKey = `${productData.title}_${productData.price}_${productData.image_url || 'no_image'}_${productData.url}`;
                    if (!analysisCache.has(cacheKey)) {
                        analysisCache.set(cacheKey, result);
                    }
                }
            });
            saveCache(); // persist batch results
            
            // Update stats in batch
            updateStatsBatch(analysisResults);
            
        } catch (error) {
            console.error('Error analyzing selected products:', error);
            alert('Error analyzing products. Please try again.');
        } finally {
            // Reset button state
            analyzeBtn.textContent = originalText;
            analyzeBtn.disabled = false;
            analyzeBtn.style.background = '#4CAF50';
        }
    }

    async function analyzeProductsBatch(productsData) {
        try {
            console.log(`TruthLens: Sending batch analysis request for ${productsData.length} products`);
            
            const response = await fetch(`${API_BASE_URL}/analyze-products-batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ products: productsData })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP error! status: ${response.status}, response: ${errorText}`);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('TruthLens: Batch analysis response:', result);
            
            if (!result.success) {
                throw new Error(result.error || 'Batch analysis failed');
            }
            
            return result.results || [];
            
        } catch (error) {
            console.error('TruthLens: Batch analysis failed:', error);
            
            // Show more specific error message to user
            let errorMessage = 'Error analyzing products. Please try again.';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Cannot connect to backend server. Please make sure the backend is running.';
            } else if (error.message.includes('HTTP error')) {
                errorMessage = `Server error: ${error.message}`;
            } else if (error.message.includes('Rate limit')) {
                errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
            }
            
            // Show error to user
            showNotification(`TruthLens Error: ${errorMessage}`, 'error');
            
            // Return fallback results
            return productsData.map(productData => ({
                success: false,
                error: error.message,
                analysis: {
                    status: 'uncertain',
                    legitimacy_percentage: 50.0,
                    scam_percentage: 25.0,
                    legit_percentage: 50.0,
                    uncertain_percentage: 25.0,
                    review_bonus: false,
                    conclusion: `❌ Analysis Error: ${error.message}\n\n⚠️ FINAL VERDICT: This product is UNCERTAIN - unable to complete analysis`,
                    ai_percentages: {
                        text_ai_percentage: 0.0,
                        image_ai_percentage: 0.0,
                        average_ai_percentage: 0.0
                    },
                    analysis_details: {
                        error: error.message,
                        error_type: 'connection_error'
                    }
                }
            }));
        }
    }

    function showNotification(message, type = 'info') {
        // Remove existing notifications
        const existingNotification = document.querySelector('[data-truthlens-notification]');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        const notification = document.createElement('div');
        notification.setAttribute('data-truthlens-notification', 'true');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#4CAF50'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    function updateProductsWithResults(checkboxes, analysisResults) {
        checkboxes.forEach((checkbox, index) => {
            const result = analysisResults[index];
            if (result && result.analysis) {
                // Store parent element before removing checkbox
                const parentElement = checkbox.parentElement;
                
                // Remove checkbox
                checkbox.remove();
                
                // Add analysis indicator only if parent element still exists
                if (parentElement && parentElement.parentNode) {
                    const indicator = createIndicator(result.analysis.status, result);
                    parentElement.appendChild(indicator);
                } else {
                    console.warn('TruthLens: Parent element not found for checkbox', checkbox);
                }
            }
        });
    }

    function createIndicator(status, analysisResult = null) {
        const indicator = document.createElement('button');
        indicator.setAttribute('data-truthlens', 'true');
        indicator.style.position = 'absolute';
        indicator.style.top = '10px';
        indicator.style.right = '10px';
        indicator.style.width = '22px';
        indicator.style.height = '22px';
        indicator.style.borderRadius = '50%';
        indicator.style.color = '#fff';
        indicator.style.display = 'flex';
        indicator.style.alignItems = 'center';
        indicator.style.justifyContent = 'center';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontSize = '12px';
        indicator.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
        indicator.style.border = '2px solid #fff';

        indicator.style.border = 'none';
        indicator.style.outline = 'none';
        indicator.style.cursor = 'pointer';
        indicator.style.zIndex = '9999';
        indicator.style.pointerEvents = 'auto';
        indicator.style.userSelect = 'none';

        // Store analysis result for display
        indicator.analysisResult = analysisResult;

        indicator.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const existingBox = document.querySelector('[data-truthlens-info]');
            if (existingBox) {
                existingBox.remove();
                return;
            }

            const infoBox = document.createElement('div');
            infoBox.setAttribute('data-truthlens-info', 'true');
            infoBox.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(88, 81, 85, 0.95);
                border: 2px solid rgb(255, 255, 255);
                border-radius: 8px;
                padding: 20px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 10000;
                max-width: 400px;
                font-family: Arial, sans-serif;
            `;

            // Generate detailed analysis content
            let analysisContent = '';
            if (analysisResult && analysisResult.analysis) {
                const analysis = analysisResult.analysis;
                
                analysisContent = `
                    <p style="margin: 5px 0; color: #fff;"><strong>Status:</strong> ${analysis.status.toUpperCase()}</p>
                    <p style="margin: 5px 0; color: #fff;"><strong>Legitimacy:</strong> ${analysis.legit_percentage?.toFixed(1) || 'N/A'}%</p>
                    <p style="margin: 5px 0; color: #fff;"><strong>Scam Risk:</strong> ${analysis.scam_percentage?.toFixed(1) || 'N/A'}%</p>
                    ${analysis.ai_percentages ? `
                        <p style="margin: 5px 0; color: #fff;"><strong>AI Generation Analysis:</strong></p>
                        <p style="margin: 2px 0; color: #fff;">• Text: ${analysis.ai_percentages.text_ai_percentage}%</p>
                        <p style="margin: 2px 0; color: #fff;">• Image: ${analysis.ai_percentages.image_ai_percentage || 0}%</p>
                        ${analysis.ai_percentages.average_ai_percentage !== undefined ? `
                            <p style="margin: 2px 0; color: #fff;"><strong>• Average: ${analysis.ai_percentages.average_ai_percentage}%</strong></p>
                        ` : ''}
                    ` : ''}
                    ${analysis.review_bonus ? `
                        <p style="margin: 5px 0; color: #fff;"><strong>Review Bonus:</strong> Applied (+10%)</p>
                    ` : ''}
                    ${analysis.conclusion ? `
                        <div style="margin: 10px 0; padding: 10px; background: rgba(255,255,255,0.1); border-radius: 4px;">
                            <p style="margin: 0; color: #fff; font-size: 12px; white-space: pre-line;">${analysis.conclusion}</p>
                        </div>
                    ` : ''}
                `;
            } else if (analysisResult && analysisResult.status === 'processing') {
                analysisContent = `
                    <div style="text-align: center; padding: 20px;">
                        <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-top: 4px solid #fff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                        <p style="margin: 15px 0; color: #fff; font-size: 16px;"><strong>🔄 Analyzing Product...</strong></p>
                        <p style="margin: 5px 0; color: #fff; font-size: 14px;">Please wait while we analyze this product</p>
                        <p style="margin: 5px 0; color: #fff;"><strong>Queue Position:</strong> Processing...</p>
                        <p style="margin: 5px 0; color: #fff;"><strong>Analysis Count:</strong> ${analysisCount}/${MAX_ANALYSIS_LIMIT}</p>
                    </div>
                    <style>
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    </style>
                `;
            } else {
                analysisContent = `
                    <p style="margin: 5px 0; color: #fff;"><strong>Status:</strong> ${status.toUpperCase()}</p>
                    <p style="margin: 5px 0; color: #fff;"><strong>Analysis:</strong> This product has been analyzed for potential scams.</p>
                    <p style="margin: 5px 0; color: #fff;"><strong>Confidence:</strong> ${status === 'scam' ? 'High scam risk' : status === 'legit' ? 'High legitimacy' : 'Medium uncertainty'}</p>
                    <p style="margin: 5px 0; color: #fff;"><strong>Analysis Count:</strong> ${analysisCount}/${MAX_ANALYSIS_LIMIT}</p>
                `;
            }

            infoBox.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <img id="truthlens-logo" alt="TruthLens Logo" style="width: 40px; height: 50px; margin-right: 10px;">
                    <h3 style="margin: 0; color: #fff;">TruthLens Analysis</h3>
                </div>
                ${analysisContent}
                <p style="margin: 5px 0; color: #fff;"><strong>Last Updated:</strong> ${new Date().toLocaleString()}</p>
                <button id="close-btn" style="margin-top: 15px; padding: 8px 16px; background: rgba(255, 255, 255, 0.2); color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Close
                </button>
            `;

            // Load the logo using Chrome extension API
            const logoImg = infoBox.querySelector('#truthlens-logo');
            if (chrome && chrome.runtime) {
                try {
                    const logoUrl = chrome.runtime.getURL('logo3.png');
                    logoImg.src = logoUrl;
                    logoImg.onerror = () => {
                        // Fallback to styled TL if logo fails to load
                        logoImg.style.display = 'none';
                        const tlDiv = document.createElement('div');
                        tlDiv.style.cssText = 'width: 40px; height: 50px; background: linear-gradient(45deg, #4CAF50, #2196F3); border-radius: 8px; margin-right: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;';
                        tlDiv.textContent = 'TL';
                        logoImg.parentNode.insertBefore(tlDiv, logoImg);
                    };
                } catch (e) {
                    // Fallback to styled TL if Chrome API fails
                    logoImg.style.display = 'none';
                    const tlDiv = document.createElement('div');
                    tlDiv.style.cssText = 'width: 40px; height: 50px; background: linear-gradient(45deg, #4CAF50, #2196F3); border-radius: 8px; margin-right: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;';
                    tlDiv.textContent = 'TL';
                    logoImg.parentNode.insertBefore(tlDiv, logoImg);
                }
            } else {
                // Fallback for non-Chrome environments
                logoImg.style.display = 'none';
                const tlDiv = document.createElement('div');
                tlDiv.style.cssText = 'width: 40px; height: 50px; background: linear-gradient(45deg, #4CAF50, #2196F3); border-radius: 8px; margin-right: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;';
                tlDiv.textContent = 'TL';
                logoImg.parentNode.insertBefore(tlDiv, logoImg);
            }

            document.body.appendChild(infoBox);

            // Add event listener to close button (this is the fix!)
            const closeBtn = infoBox.querySelector('#close-btn');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                infoBox.remove();
            });
            
            // Add hover effects for close button
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            });

            // Close on background click
            infoBox.addEventListener('click', (e) => {
                if (e.target === infoBox) {
                    infoBox.remove();
                }
            });

        });
        applyStatusToIndicator(indicator, status);
        return indicator;
    }

    function updateAllIndicators(status) {
        document.querySelectorAll('[data-truthlens="true"]').forEach(ind => applyStatusToIndicator(ind, status));
    }

    async function processProducts() {
        if (!isActive) return;
        const site = getCurrentSite();
        const config = siteConfigs[site];
        if (!config) return;

        for (const selector of config.productSelectors) {
            const products = document.querySelectorAll(selector);
            
            for (const product of products) {
                if (isProcessed(product)) continue;
                
                const style = getComputedStyle(product);
                if (style.position === 'static') {
                    product.style.position = 'relative';
                }
                
                // Extract product data
                const productData = extractProductData(product, site);
                
                // Only add checkbox if we have meaningful data
                if (productData.title && productData.title.length > 3) {
                    // Create checkbox for product selection
                    const checkbox = createProductCheckbox(productData);
                    product.appendChild(checkbox);
                } else {
                    // Fallback: try to extract basic info from the element itself
                    console.log('TruthLens: No meaningful data extracted, trying fallback for element:', product);
                    
                    // Try to find any text that might be a title
                    const fallbackTitle = product.textContent.trim().split('\n')[0].substring(0, 100);
                    if (fallbackTitle && fallbackTitle.length > 3) {
                        const fallbackData = {
                            ...productData,
                            title: fallbackTitle,
                            description: 'Extracted from page content'
                        };
                        const checkbox = createProductCheckbox(fallbackData);
                        product.appendChild(checkbox);
                    }
                }
                
                markProcessed(product);
            }
        }
        
        // Add analyze button if it doesn't exist
        addAnalyzeButton();
    }

    // Update statistics with more detailed tracking
    function updateStatsBatch(analysisResults) {
        try {
            chrome.storage?.local?.get(['truthlens_stats', 'truthlens_session_stats'], (result) => {
                // Update overall stats
                const stats = result?.truthlens_stats || { legit: 0, scam: 0, uncertain: 0 };
                
                // Update session stats (current website)
                const sessionStats = result?.truthlens_session_stats || { 
                    legit: 0, 
                    scam: 0, 
                    uncertain: 0,
                    total_analyzed: 0,
                    last_updated: Date.now(),
                    website: window.location.hostname
                };
                
                // Count each status type
                let legitCount = 0, scamCount = 0, uncertainCount = 0;
                
                analysisResults.forEach(result => {
                    if (result.analysis) {
                        const status = result.analysis.status;
                        if (status === 'legit') legitCount++;
                        else if (status === 'scam') scamCount++;
                        else if (status === 'uncertain') uncertainCount++;
                        
                        // Update overall stats
                        stats[status] = (stats[status] || 0) + 1;
                    }
                });
                
                // Update session stats
                sessionStats.legit += legitCount;
                sessionStats.scam += scamCount;
                sessionStats.uncertain += uncertainCount;
                sessionStats.total_analyzed += analysisResults.length;
                sessionStats.last_updated = Date.now();
                sessionStats.website = window.location.hostname;
                
                // Store the last analysis result
                if (analysisResults.length > 0 && analysisResults[analysisResults.length - 1].analysis) {
                    const lastAnalysis = analysisResults[analysisResults.length - 1].analysis;
                    sessionStats.last_analysis = {
                        status: lastAnalysis.status,
                        legitimacy_percentage: lastAnalysis.legitimacy_percentage,
                        scam_percentage: lastAnalysis.scam_percentage,
                        legit_percentage: lastAnalysis.legit_percentage,
                        uncertain_percentage: lastAnalysis.uncertain_percentage,
                        review_bonus: lastAnalysis.review_bonus,
                        timestamp: Date.now()
                    };
                }
                
                chrome.storage?.local?.set({ 
                    truthlens_stats: stats,
                    truthlens_session_stats: sessionStats
                });
                
                console.log(`TruthLens: Updated batch stats - Legit: ${legitCount}, Scam: ${scamCount}, Uncertain: ${uncertainCount} (Total: ${analysisResults.length})`);
            });
        } catch (error) {
            console.error('Error updating batch stats:', error);
        }
    }

    function updateStats(status, analysisResult = null) {
        try {
            chrome.storage?.local?.get(['truthlens_stats', 'truthlens_session_stats'], (result) => {
                // Update overall stats
                const stats = result?.truthlens_stats || { legit: 0, scam: 0, uncertain: 0 };
                stats[status] = (stats[status] || 0) + 1;
                
                // Update session stats (current website)
                const sessionStats = result?.truthlens_session_stats || { 
                    legit: 0, 
                    scam: 0, 
                    uncertain: 0,
                    total_analyzed: 0,
                    last_updated: Date.now(),
                    website: window.location.hostname
                };
                sessionStats[status] = (sessionStats[status] || 0) + 1;
                sessionStats.total_analyzed = (sessionStats.total_analyzed || 0) + 1;
                sessionStats.last_updated = Date.now();
                sessionStats.website = window.location.hostname;
                
                // Store detailed analysis if provided
                if (analysisResult && analysisResult.analysis) {
                    const analysis = analysisResult.analysis;
                    sessionStats.last_analysis = {
                        status: status,
                        legitimacy_percentage: analysis.legitimacy_percentage,
                        scam_percentage: analysis.scam_percentage,
                        legit_percentage: analysis.legit_percentage,
                        uncertain_percentage: analysis.uncertain_percentage,
                        review_bonus: analysis.review_bonus,
                        timestamp: Date.now()
                    };
                }
                
                chrome.storage?.local?.set({ 
                    truthlens_stats: stats,
                    truthlens_session_stats: sessionStats
                });
                
                console.log(`TruthLens: Updated stats - ${status}: ${sessionStats[status]} (Total: ${sessionStats.total_analyzed})`);
            });
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    function startObserver() {
        if (mutationObserver) return;
        mutationObserver = new MutationObserver((mutations) => {
            let shouldProcess = false;
            for (const m of mutations) {
                if (m.type === 'childList' && m.addedNodes.length > 0) { 
                    shouldProcess = true; 
                    break; 
                }
            }
            if (shouldProcess) {
                // Use setTimeout to allow async processing
                setTimeout(() => {
                    processProducts().catch(error => {
                        console.error('Error in processProducts:', error);
                    });
                }, 400);
            }
        });
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                processProducts().catch(error => {
                    console.error('Error in processProducts (scroll):', error);
                });
            }, 300);
        }, { passive: true });
    }

    function stopObserver() {
        try { mutationObserver?.disconnect(); } catch (_) { }
        mutationObserver = null;
    }


    try {
        chrome.storage?.local?.get([STORAGE_ACTIVE_KEY, STORAGE_STATUS_KEY], (result) => {
            if (result && typeof result[STORAGE_ACTIVE_KEY] === 'boolean') {
                isActive = result[STORAGE_ACTIVE_KEY];
            } else {
                chrome.storage?.local?.set({ [STORAGE_ACTIVE_KEY]: isActive });
            }
            chrome.storage?.local?.set({ [STORAGE_STATUS_KEY]: currentStatus });

            if (isActive) {
                processProducts().catch(error => {
                    console.error('Error in initial processProducts:', error);
                });
                startObserver();
            }
        });
    } catch (_) { }

    try {
        chrome.storage?.onChanged?.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[STORAGE_STATUS_KEY] && typeof changes[STORAGE_STATUS_KEY].newValue === 'string') {
                currentStatus = changes[STORAGE_STATUS_KEY].newValue;
                if (isActive) updateAllIndicators(currentStatus);
            }
        });
    } catch (_) { }

    // Handle messages from popup
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!message || !message.type) return;
        if (message.type === 'GET_ACTIVE') {
            sendResponse({ active: isActive });
        }
        if (message.type === 'SET_ACTIVE' && typeof message.active === 'boolean') {
            isActive = message.active;
            try { chrome.storage?.local?.set({ [STORAGE_ACTIVE_KEY]: isActive }); } catch (_) { }
            if (isActive) {
                processProducts().catch(error => {
                    console.error('Error in initial processProducts:', error);
                });
                startObserver();
            } else {
                stopObserver();
                removeAllIndicators();
            }
            sendResponse({ active: isActive });
        }
        if (message.type === 'SET_STATUS' && typeof message.status === 'string') {
            currentStatus = message.status;
            try { chrome.storage?.local?.set({ [STORAGE_STATUS_KEY]: currentStatus }); } catch (_) { }
            if (isActive) updateAllIndicators(currentStatus);
            sendResponse({ status: currentStatus });
        }
        if (message.type === 'GET_STATUS') {
            sendResponse({ status: currentStatus });
        }
    });
})();
