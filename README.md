# TruthLens - Product Scam Detector

TruthLens is a browser extension that helps you detect potential scams on e-commerce websites by analyzing products using AI-powered analysis with Google Gemini.

## Features

- ☑️ **Product Selection**: Select products manually using checkboxes on search results pages
- 🤖 **AI-Powered Detection**: Uses Google Gemini AI to analyze product text and images
- 📊 **Batch Analysis**: Analyze multiple selected products at once
- 📈 **Percentage-Based Scoring**: Get detailed legitimacy, scam, and uncertain percentages
- 🎯 **Multi-site Support**: Works on Amazon (all regions), Walmart, eBay, Target, Best Buy, Newegg, Alibaba, AliExpress, and Etsy
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
- Etsy

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

### Known Limitations
- Maximum 100 products analyzed per session (requires page refresh to reset)
- Sequential processing may result in longer wait times for batch analyses
- Image analysis depends on image URL accessibility from backend server
- Analysis caching persists in browser localStorage

