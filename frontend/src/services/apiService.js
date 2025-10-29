// API service for communicating with the TruthLens backend
const API_BASE_URL = 'http://localhost:8000'; // Backend URL

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Generic request method
  async makeRequest(endpoint, method = 'GET', data = null) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Analyze product using the backend
  async analyzeProduct(productData) {
    try {
      const result = await this.makeRequest('/analyze-product', 'POST', productData);
      return result;
    } catch (error) {
      console.error('Product analysis failed:', error);
      // Return fallback analysis if API fails
      return {
        success: false,
        error: error.message,
        analysis: {
          status: 'uncertain',
          confidence: 0.5,
          reasons: ['Unable to analyze - API unavailable'],
          indicators: {
            scam_indicators: 0,
            legit_indicators: 0
          }
        }
      };
    }
  }

  // Analyze multiple products in batch
  async analyzeProductsBatch(productsData) {
    try {
      const result = await this.makeRequest('/analyze-products-batch', 'POST', { products: productsData });
      return result;
    } catch (error) {
      console.error('Batch product analysis failed:', error);
      // Return fallback analysis for each product
      return {
        success: false,
        error: error.message,
        results: productsData.map(productData => ({
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
              image_ai_percentage: 0.0
            },
            analysis_details: {
              error: error.message,
              error_type: 'connection_error'
            }
          }
        }))
      };
    }
  }

  // Check text using AI detection (legacy endpoint)
  async checkText(text) {
    try {
      const result = await this.makeRequest('/check-text', 'POST', { text });
      return result;
    } catch (error) {
      console.error('Text check failed:', error);
      throw error;
    }
  }

  // Test backend connection
  async testConnection() {
    try {
      // Try to make a simple request to test connection
      await fetch(`${this.baseURL}/docs`, { method: 'HEAD' });
      return true;
    } catch (error) {
      console.error('Backend connection test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;

