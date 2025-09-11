const crypto = require('crypto');
const config = require('../config/config');

/**
 * TEvo Request Signature Service
 * 
 * Handles signing requests for both v9 and v10 Ticket Evolution APIs
 * Following the official documentation:
 * https://ticketevolution.atlassian.net/wiki/spaces/API/pages/983115/Signing%2Brequests%2Bwith%2BX-Signature
 */
class TevoSignatureService {
  constructor() {
    this.secret = config.ticketEvolution.apiSecret;
    
    if (!this.secret) {
      throw new Error('TICKET_EVOLUTION_API_SECRET is required for signing requests');
    }
  }

  /**
   * Generate X-Signature for TEvo API requests
   * 
   * @param {Object} options - Request options
   * @param {string} options.method - HTTP method (GET, POST, etc.)
   * @param {string} options.host - API host (e.g., 'api.sandbox.ticketevolution.com')
   * @param {string} options.path - API path (e.g., '/v9/events')
   * @param {Object} [options.query] - Query parameters object
   * @param {Object} [options.body] - Request body object (for POST/PUT)
   * @returns {string} Base64 encoded signature
   */
  generateSignature({ method, host, path, query = {}, body = null }) {
    try {
      const upperMethod = method.toUpperCase();
      let signatureString = `${upperMethod} ${host}${path}`;

      if (body) {
        // For POST/PUT requests with JSON body
        const jsonBody = JSON.stringify(body);
        signatureString += `?${jsonBody}`;
      } else {
        // For GET requests with query parameters
        const queryString = this._buildQueryString(query);
        signatureString += `?${queryString}`;
      }

      // Generate HMAC-SHA256 signature
      const signature = crypto
        .createHmac('sha256', this.secret)
        .update(signatureString)
        .digest('base64');

      if (process.env.NODE_ENV === 'development') {
        console.log(`🔐 TEvo Signature for: ${signatureString}`);
        console.log(`🔐 Generated signature: ${signature}`);
      }

      return signature;
    } catch (error) {
      console.error('❌ Error generating TEvo signature:', error.message);
      throw new Error('Failed to generate API signature');
    }
  }

  /**
   * Build query string from parameters object
   * Parameters are sorted alphabetically as required by TEvo
   * 
   * @param {Object} params - Query parameters
   * @returns {string} URL-encoded query string
   */
  _buildQueryString(params) {
    if (!params || Object.keys(params).length === 0) {
      return '';
    }

    return Object.keys(params)
      .sort() // Sort alphabetically as required by TEvo
      .map(key => {
        const value = params[key];
        if (value === undefined || value === null) {
          return null;
        }
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      })
      .filter(Boolean)
      .join('&');
  }

  /**
   * Get signed request headers for TEvo API
   * 
   * @param {Object} options - Request options (same as generateSignature)
   * @returns {Object} Headers object with X-Token and X-Signature
   */
  getSignedHeaders(options) {
    const signature = this.generateSignature(options);
    
    return {
      'X-Token': config.ticketEvolution.apiToken,
      'X-Signature': signature,
      'Content-Type': 'application/json',
      'Accept': options.apiVersion === 'v10' 
        ? 'application/vnd.ticketevolution.api+json; version=10'
        : 'application/vnd.ticketevolution.api+json; version=9',
    };
  }

  /**
   * Utility method to extract host from URL
   * 
   * @param {string} url - Full API URL
   * @returns {string} Host portion
   */
  extractHost(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.host;
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Utility method to extract path from URL
   * 
   * @param {string} url - Full API URL
   * @returns {string} Path portion
   */
  extractPath(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Validate that required environment variables are set
   * 
   * @returns {Object} Validation result
   */
  validateConfig() {
    const errors = [];
    
    if (!config.ticketEvolution.apiToken) {
      errors.push('TICKET_EVOLUTION_API_TOKEN is required');
    }
    
    if (!this.secret) {
      errors.push('TICKET_EVOLUTION_API_SECRET is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

module.exports = new TevoSignatureService();
