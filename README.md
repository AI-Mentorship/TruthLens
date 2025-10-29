# TruthLens - Product Scam Detector

TruthLens is a browser extension that helps you detect potential scams on e-commerce websites by analyzing products using AI-powered analysis with Google Gemini.

## Features

- ☑️ **Product Selection**: Select products manually using checkboxes on search results pages
- 🤖 **AI-Powered Detection**: Uses Google Gemini AI to analyze product text and images
- 📊 **Batch Analysis**: Analyze multiple selected products at once
- 📈 **Percentage-Based Scoring**: Get detailed legitimacy, scam, and uncertain percentages
- 🎯 **Multi-site Support**: Works on Amazon (all regions), Walmart, eBay, Target, Best Buy, Newegg, Alibaba, and AliExpress
- 📊 **Session Statistics**: Tracks analysis results (legit/scam/uncertain) for your current browsing session
- ⚡ **Smart Caching**: Prevents duplicate API calls by caching analysis results
- 🔄 **Sequential Processing**: Queue-based analysis system to manage API rate limits efficiently
- ⭐ **Review Bonus**: Automatic bonus scoring for products with 50+ reviews and 4.5+ ratings

## Architecture

### Frontend (Browser Extension)
- **React-based popup**: Main extension interface showing session statistics and toggle controls
- **Content Script**: Adds checkboxes to products and "Analyze Selected Products" button
- **API Service**: Communicates with backend for batch analysis and result polling
- **Analysis Caching**: Stores results in localStorage to prevent duplicate API calls

### Backend (FastAPI Server)
- **Sequential Queue Processing**: Processes analyses one at a time to manage API rate limits
- **Google Gemini AI Integration**: Analyzes product text and images using Gemini Vision API
- **Batch Analysis Endpoint**: `/analyze-products-batch` - Analyzes multiple products at once
- **Queue-Based Analysis**: `/analyze-product` queues analysis, `/analysis-result/{id}` retrieves results
- **Rate Limiting**: 100 API calls per hour with automatic reset
- **Fallback Analysis**: Basic heuristics when AI service is unavailable

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- Python 3.8 or higher
- Chrome/Chromium browser
- Google Gemini API key (for AI analysis)

### Backend Setup

1. Install Python dependencies:
```bash
pip install fastapi uvicorn requests beautifulsoup4 pydantic
```

2. Update API credentials in `backend/main.py`:
   - Set `api_private_key` to your Google Gemini API key
   - Adjust `api_call_limit` if needed (default: 100 per hour)

3. Start the backend server:
```bash
python start_backend.py
```
Or manually:
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Build the extension:
```bash
npm run build:extension
```

3. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `frontend/build` directory

4. Verify the backend URL in `frontend/src/services/apiService.js` matches your setup (default: `http://localhost:8000`)

## Usage

1. **Navigate** to a supported e-commerce site (Amazon, Walmart, etc.)
2. **Open the extension popup** and toggle it "On" if not already active
3. **Select products** by checking the checkboxes that appear on product cards in search results
4. **Click "Analyze Selected Products"** button (appears in bottom-right corner)
5. **Wait for analysis** - Products will be analyzed sequentially (green checkmark = legit, red X = scam, orange dots = uncertain)
6. **Click analysis indicators** on products to see detailed breakdown including:
   - Legitimacy, scam, and uncertain percentages
   - AI text and image generation analysis
   - Review bonus status
   - Complete analysis conclusion
7. **View session statistics** in the popup showing total legit/scam/uncertain products analyzed

**Note**: Analysis results are cached to prevent duplicate API calls. Each session can analyze up to 100 products before requiring a page refresh.

## Supported Websites

- Amazon (all regions)
- Walmart
- eBay
- Target
- Best Buy
- Newegg
- Alibaba
- AliExpress

## API Endpoints

### POST `/analyze-product`
Queues a product for analysis and returns an analysis ID for polling.

**Request Body**:
```json
{
  "title": "Product Title",
  "description": "Product Description",
  "price": "$99.99",
  "seller": "Seller Name",
  "rating": "4.5",
  "reviews_count": "1,234",
  "url": "https://example.com/product",
  "image_url": "https://example.com/image.jpg"
}
```

**Response**:
```json
{
  "success": true,
  "analysis_id": "analysis_1234567890",
  "message": "Analysis queued for processing",
  "status": "queued"
}
```

### GET `/analysis-result/{analysis_id}`
Retrieves the analysis result by ID. Poll this endpoint until status is "completed".

**Response**:
```json
{
  "success": true,
  "analysis": {
    "legitimacy_percentage": 75.5,
    "scam_percentage": 24.5,
    "legit_percentage": 75.5,
    "uncertain_percentage": 0.0,
    "review_bonus": true,
    "status": "legit",
    "conclusion": "📊 AI Analysis Results:...",
    "ai_percentages": {
      "text_ai_percentage": 15.0,
      "image_ai_percentage": 20.0,
      "average_ai_percentage": 17.5
    }
  },
  "status": "completed"
}
```

### POST `/analyze-products-batch`
Analyzes multiple products in batch (used by the extension). Processes products sequentially.

**Request Body**:
```json
{
  "products": [
    {
      "title": "Product 1",
      "description": "...",
      "price": "$99.99",
      "seller": "...",
      "rating": "4.5",
      "reviews_count": "100",
      "url": "...",
      "image_url": "..."
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "analysis": { /* analysis object */ }
    }
  ],
  "total_analyzed": 1,
  "successful": 1,
  "failed": 0
}
```

### POST `/check-text`
Legacy endpoint for AI text detection.

### GET `/health`
Health check endpoint to verify backend and AI service connectivity.

## Analysis System

TruthLens uses a comprehensive AI-powered analysis system:

### AI-Powered Detection
- **Text Analysis**: Uses Google Gemini to analyze product titles, descriptions, and metadata
- **Image Analysis**: Uses Gemini Vision API to detect AI-generated product images
- **Combined Scoring**: Averages text and image AI generation probabilities
- **Legitimacy Conversion**: Converts AI scores to legitimacy percentages (0-100%)

### Review Bonus System
Products with **50+ reviews** and **4.5+ star ratings** receive a **+10% legitimacy bonus** (capped at 95%).

### Status Determination
- **Legit** (Green ✓): ≥70% legitimacy percentage
- **Uncertain** (Orange ...): 40-69% legitimacy percentage  
- **Scam** (Red ✗): <40% legitimacy percentage

### Fallback Analysis
When AI service is unavailable, uses basic heuristics:
- Suspicious keywords in titles
- Unusually low prices (<$1)
- Very low ratings (<2.0)
- Reputable seller detection

## Configuration

### Backend Configuration
- **Google Gemini API Key**: Update `api_private_key` in `backend/main.py` (line 35)
- **API Call Limit**: Adjust `api_call_limit` in `backend/main.py` (default: 100 per hour, line 15)
- **API Endpoint**: Modify `api_link` in `backend/main.py` if using different Gemini endpoint
- **CORS Settings**: Currently allows all origins (`*`); restrict for production use

### Frontend Configuration
- **Backend URL**: Update `API_BASE_URL` in `frontend/src/services/apiService.js` (line 2)
- **Analysis Limit**: Modify `MAX_ANALYSIS_LIMIT` in `frontend/public/content.js` (default: 100 products per session)
- **Supported Sites**: Site-specific selectors are configured in `frontend/public/content.js` under `siteConfigs` object

### Rate Limiting
The backend enforces rate limits to prevent exceeding API quotas:
- **Default**: 100 API calls per hour
- **Reset**: Automatically resets every hour
- **Queue Processing**: Analyses are processed sequentially with 2-second delays

## Development

### Project Structure
```
truthlens/
├── backend/
│   └── main.py              # FastAPI backend server
├── frontend/
│   ├── src/
│   │   ├── App.js           # Main React popup component
│   │   ├── Components/      # Settings and Information components
│   │   └── services/
│   │       └── apiService.js # API client service
│   └── public/
│       ├── content.js       # Content script (runs on e-commerce pages)
│       └── manifest.json    # Chrome extension manifest
└── start_backend.py         # Backend startup script
```

### Running in Development

**Backend:**
```bash
python start_backend.py
# Server runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

**Frontend:**
```bash
cd frontend
npm start
# Build extension with: npm run build:extension
```

### Testing
- Test backend health: `GET http://localhost:8000/health`
- Test batch analysis: Use extension on Amazon/Walmart product search pages
- View API documentation: `http://localhost:8000/docs` (Swagger UI)

### Known Limitations
- Maximum 100 products analyzed per session (requires page refresh to reset)
- Sequential processing may result in longer wait times for batch analyses
- Image analysis depends on image URL accessibility from backend server
- Analysis caching persists in browser localStorage

