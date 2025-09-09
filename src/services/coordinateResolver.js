const geoip = require('geoip-lite');

/**
 * Coordinate Resolver Service
 * 
 * Provides stateless, reliable coordinate resolution with the following priority:
 * 1. Browser-provided lat/lon coordinates (highest priority)
 * 2. Server-side GeoIP lookup from IP address
 * 3. No coordinates (returns null)
 * 
 * Key principles:
 * - Never sends `within` parameter without valid lat/lon coordinates
 * - Always validates coordinate ranges
 * - Logs geolocation failures for monitoring
 * - Uses local GeoIP database (no external HTTP calls)
 */
class CoordinateResolver {
  constructor() {
    this.logger = console; // Can be replaced with Winston/other logger
  }

  /**
   * Resolve coordinates from multiple sources
   * @param {Object} input - Input parameters
   * @param {number} [input.lat] - Browser-provided latitude
   * @param {number} [input.lon] - Browser-provided longitude  
   * @param {string} [input.ip] - IP address for server-side lookup
   * @param {string} [input.requestId] - Request ID for logging
   * @returns {Object|null} Coordinates object or null if no valid coordinates found
   */
  async resolveCoordinates(input = {}) {
    const { lat, lon, ip, requestId = 'unknown' } = input;

    // Priority 1: Use browser-provided coordinates if available
    if (lat !== undefined && lon !== undefined) {
      const browserCoords = this.validateCoordinates(lat, lon);
      if (browserCoords) {
        this.logger.log(`✅ [${requestId}] Using browser coordinates: ${browserCoords.lat}, ${browserCoords.lon}`);
        return {
          ...browserCoords,
          source: 'browser',
          accuracy: 'high'
        };
      } else {
        this.logger.warn(`⚠️ [${requestId}] Invalid browser coordinates provided: lat=${lat}, lon=${lon}`);
      }
    }

    // Priority 2: Server-side GeoIP lookup
    if (ip && this.isValidIP(ip)) {
      const geoipCoords = this.resolveFromIP(ip, requestId);
      if (geoipCoords) {
        this.logger.log(`📍 [${requestId}] Using GeoIP coordinates: ${geoipCoords.lat}, ${geoipCoords.lon} (${geoipCoords.city}, ${geoipCoords.country})`);
        return {
          ...geoipCoords,
          source: 'geoip',
          accuracy: 'medium'
        };
      }
    }

    // Priority 3: No valid coordinates found
    this.logger.log(`❌ [${requestId}] No valid coordinates found - will fetch events without location filter`);
    return null;
  }

  /**
   * Validate coordinate ranges
   * @param {any} lat - Latitude value
   * @param {any} lon - Longitude value  
   * @returns {Object|null} Valid coordinates or null
   */
  validateCoordinates(lat, lon) {
    // Convert to numbers
    const numLat = parseFloat(lat);
    const numLon = parseFloat(lon);

    // Check if conversion was successful
    if (isNaN(numLat) || isNaN(numLon)) {
      return null;
    }

    // Validate ranges: lat [-90, 90], lon [-180, 180]
    if (numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
      return null;
    }

    return {
      lat: numLat,
      lon: numLon
    };
  }

  /**
   * Resolve coordinates from IP address using local GeoIP database
   * @param {string} ip - IP address
   * @param {string} requestId - Request ID for logging
   * @returns {Object|null} Coordinates with location info or null
   */
  resolveFromIP(ip, requestId) {
    try {
      // Skip local/private IPs
      if (this.isLocalIP(ip)) {
        this.logger.log(`🏠 [${requestId}] Skipping local IP: ${ip}`);
        return null;
      }

      // Lookup using geoip-lite
      const geo = geoip.lookup(ip);
      
      if (!geo || !geo.ll || geo.ll.length !== 2) {
        this.logger.log(`❓ [${requestId}] GeoIP lookup failed for IP: ${ip}`);
        return null;
      }

      const [lat, lon] = geo.ll;
      
      // Validate the coordinates from GeoIP
      const validatedCoords = this.validateCoordinates(lat, lon);
      if (!validatedCoords) {
        this.logger.warn(`⚠️ [${requestId}] Invalid coordinates from GeoIP for IP ${ip}: lat=${lat}, lon=${lon}`);
        return null;
      }

      return {
        ...validatedCoords,
        city: geo.city || 'Unknown',
        region: geo.region || 'Unknown', 
        country: geo.country || 'Unknown',
        timezone: geo.timezone || 'Unknown'
      };

    } catch (error) {
      this.logger.error(`❌ [${requestId}] GeoIP lookup error for IP ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Check if IP address is valid format
   * @param {string} ip - IP address
   * @returns {boolean} True if valid IP format
   */
  isValidIP(ip) {
    if (!ip || typeof ip !== 'string') {
      return false;
    }

    // Basic IPv4 regex - more robust validation could be added
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    // Basic IPv6 regex - simplified
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }

  /**
   * Check if IP is local/private (should not be used for GeoIP)
   * @param {string} ip - IP address
   * @returns {boolean} True if local/private IP
   */
  isLocalIP(ip) {
    if (!ip) return true;
    
    // Local/loopback addresses
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }

    // Private IP ranges (RFC 1918)
    const privateRanges = [
      /^10\./,                    // 10.0.0.0/8
      /^192\.168\./,              // 192.168.0.0/16
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    ];

    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Build Ticket Evolution API parameters with coordinates
   * @param {Object} coordinates - Coordinates from resolveCoordinates()
   * @param {number} radiusMiles - Radius in miles (default: 50)
   * @param {Object} additionalParams - Additional API parameters
   * @returns {Object} Parameters for TEvo API
   */
  buildTEvoParams(coordinates, radiusMiles = 50, additionalParams = {}) {
    const params = {
      // Always include these base parameters
      only_with_available_tickets: true,
      ...additionalParams
    };

    // Only add location parameters if we have valid coordinates
    if (coordinates && coordinates.lat && coordinates.lon) {
      params.lat = coordinates.lat;
      params.lon = coordinates.lon;
      params.within = radiusMiles;
    }
    // CRITICAL: Never add 'within' without lat/lon coordinates

    return params;
  }

  /**
   * Get country code from IP for coarse filtering when coordinates unavailable
   * @param {string} ip - IP address
   * @param {string} requestId - Request ID for logging
   * @returns {string|null} ISO country code or null
   */
  getCountryFromIP(ip, requestId) {
    try {
      if (!ip || this.isLocalIP(ip)) {
        return null;
      }

      const geo = geoip.lookup(ip);
      const country = geo?.country;
      
      if (country) {
        this.logger.log(`🌍 [${requestId}] Detected country from IP ${ip}: ${country}`);
      }
      
      return country || null;
    } catch (error) {
      this.logger.error(`❌ [${requestId}] Country lookup error for IP ${ip}:`, error.message);
      return null;
    }
  }

  /**
   * Health check for coordinate resolver
   * @returns {Object} Health status
   */
  async healthCheck() {
    try {
      // Test with a known IP (Google DNS)
      const testCoords = this.resolveFromIP('8.8.8.8', 'health-check');
      
      return {
        status: 'healthy',
        message: 'Coordinate resolver is operational',
        geoipDatabase: 'loaded',
        testLookup: testCoords ? 'success' : 'failed',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: 'Coordinate resolver error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new CoordinateResolver();
