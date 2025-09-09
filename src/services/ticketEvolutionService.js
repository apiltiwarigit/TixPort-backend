const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/config');
const coordinateResolver = require('./coordinateResolver');

class TicketEvolutionService {
  constructor() {
    this.baseURL = config.ticketEvolution.apiUrl;
    this.apiToken = config.ticketEvolution.apiToken;
    this.apiSecret = config.ticketEvolution.apiSecret;
    this.environment = config.ticketEvolution.environment;
    this.timeout = config.ticketEvolution.timeout;

    // Development cache to reduce API calls
    this.requestCache = new Map();
    this.cacheTimeout = process.env.NODE_ENV === 'development' ? 30000 : 0; // 30 seconds in dev

    if (!this.apiToken) {
      throw new Error('TICKET_EVOLUTION_API_TOKEN is required. Please set the environment variable.');
    }

    console.log(`🎫 TicketEvolution: ${this.environment.toUpperCase()} mode initialized`);
    console.log(`💾 Request caching: ${this.cacheTimeout > 0 ? `Enabled (${this.cacheTimeout}ms)` : 'Disabled'}`);

    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'X-Token': this.apiToken,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.ticketevolution.api+json; version=9',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (request) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📤 ${request.method?.toUpperCase()} ${request.url}`);
        }
        return request;
      },
      (error) => {
        console.error('❌ TicketEvolution API Request Error:', error.message);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📥 ${response.status} ${response.config.url}`);
        }
        return response;
      },
      async (error) => {
        const status = error.response?.status;
        const config = error.config;

        // Handle rate limiting with retry logic in development
        if (status === 429 && process.env.NODE_ENV === 'development' && config && !config._retry) {
          config._retry = true;

          // Extract retry-after header or use exponential backoff
          const retryAfter = error.response?.headers?.['retry-after'] || 5;
          const delay = Math.min(parseInt(retryAfter) * 1000, 30000); // Max 30 seconds

          console.log(`⏳ Rate limited! Retrying in ${delay}ms...`);

          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.client.request(config);
        }

        console.error('❌ TicketEvolution API Error:', status, error.message);
        return Promise.reject(this.handleError(error));
      }
    );
  }

  // Cache helper methods
  getCacheKey(endpoint, params) {
    // Create a deterministic cache key by sorting and normalizing the parameters
    const normalizedParams = this.normalizeParams(params);
    return `${endpoint}:${JSON.stringify(normalizedParams)}`;
  }

  // Normalize parameters to ensure consistent cache keys
  normalizeParams(params) {
    if (!params || typeof params !== 'object') return params;
    
    const normalized = {};
    
    // Sort keys to ensure consistent ordering
    const sortedKeys = Object.keys(params).sort();
    
    for (const key of sortedKeys) {
      const value = params[key];
      
      // Handle nested objects (like filters)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        normalized[key] = this.normalizeParams(value);
      } else {
        // Normalize primitive values
        if (typeof value === 'string') {
          const trimmed = value.trim();
          // Convert string booleans to actual booleans
          if (trimmed === 'true') {
            normalized[key] = true;
          } else if (trimmed === 'false') {
            normalized[key] = false;
          } else {
            normalized[key] = trimmed;
          }
        } else if (typeof value === 'number' && !isNaN(value)) {
          normalized[key] = Number(value);
        } else if (typeof value === 'boolean') {
          normalized[key] = Boolean(value);
        } else {
          normalized[key] = value;
        }
      }
    }
    
    return normalized;
  }

  getCachedResponse(cacheKey) {
    if (this.cacheTimeout === 0) return null;

    const cached = this.requestCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.requestCache.delete(cacheKey);
      return null;
    }

    console.log(`💾 Cache hit for: ${cacheKey}`);
    return cached.data;
  }

  setCachedResponse(cacheKey, data) {
    if (this.cacheTimeout === 0) return;

    this.requestCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });

    console.log(`💾 Cached response for: ${cacheKey}`);
  }

  // Clear cache for debugging or when cache issues occur
  clearCache(pattern = null) {
    if (pattern) {
      // Clear cache entries matching a pattern
      const keysToDelete = [];
      for (const key of this.requestCache.keys()) {
        if (key.includes(pattern)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.requestCache.delete(key));
      console.log(`🧹 Cleared ${keysToDelete.length} cache entries matching pattern: ${pattern}`);
    } else {
      // Clear all cache
      this.requestCache.clear();
      console.log(`🧹 Cleared all cache entries`);
    }
  }

  // Error handler
  handleError(error) {
    if (error.response) {
      const { status, data } = error.response;
      switch (status) {
        case 401: return new Error('Invalid API token or unauthorized access');
        case 403: return new Error('Access forbidden - check API permissions');
        case 404: return new Error('Resource not found');
        case 422: return new Error(data?.message || 'Invalid parameters sent to API');
        case 429: return new Error('Rate limit exceeded - please try again later');
        case 500: return new Error('TicketEvolution API server error');
        default: return new Error(data?.message || data?.error || `API error: ${status}`);
      }
    } else if (error.request) {
      return new Error('No response from TicketEvolution API - check connection');
    } else {
      return new Error(error.message || 'Unknown error occurred');
    }
  }

  // Get events with filtering and pagination
  async getEvents(filters = {}, page = 1, limit = 20, requestId = 'unknown') {
    try {
      // Check cache in development mode first
      const cacheKey = this.getCacheKey('events', { filters, page, limit });
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      // Resolve coordinates using the coordinate resolver
      const coordinates = await coordinateResolver.resolveCoordinates({
        lat: filters.lat,
        lon: filters.lon,
        ip: filters.ip,
        requestId
      });

      // Build TEvo API parameters using the coordinate resolver
      const baseParams = {
        page,
        per_page: Math.min(limit, 100),
        category_id: filters.category_id
      };

      // Use coordinate resolver to build location parameters
      const radiusMiles = filters.within || 50; // Default 50 miles if within is specified
      const apiParams = coordinateResolver.buildTEvoParams(coordinates, radiusMiles, baseParams);

      // Add country filter as fallback if no coordinates but we have an IP
      if (!coordinates && filters.ip) {
        const country = coordinateResolver.getCountryFromIP(filters.ip, requestId);
        if (country) {
          apiParams.country_code = country;
          console.log(`🌍 [${requestId}] Added country filter: ${country} (coordinates unavailable)`);
        }
      }

      // Log the final parameters being sent to TEvo
      console.log(`📤 [${requestId}] TEvo API params:`, {
        ...apiParams,
        // Redact sensitive info in logs
        ip: apiParams.ip ? '[REDACTED]' : undefined
      });

      const response = await this.client.get('/events', { params: apiParams });

      const result = {
        events: response.data.events || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
        locationContext: coordinates ? {
          source: coordinates.source,
          accuracy: coordinates.accuracy,
          city: coordinates.city,
          country: coordinates.country
        } : null
      };

      // Cache the response in development mode
      this.setCachedResponse(cacheKey, result);

      return result;
    } catch (error) {
      console.error(`❌ [${requestId}] getEvents error:`, error.message);
      throw error;
    }
  }

  // Get single event by ID
  async getEvent(eventId) {

    try {
      const response = await this.client.get(`/events/${eventId}`);
      return response.data;
    } catch (error) {
      console.error('❌ getEvent error:', error.message);
      throw error;
    }
  }

  // Legacy methods - kept for backward compatibility but use getEvents instead

  // Get tickets for an event
  async getEventTickets(eventId, page = 1, limit = 20) {

    try {
      const params = { page, per_page: Math.min(limit, 100) };
      const response = await this.client.get(`/events/${eventId}/tickets`, { params });

      return {
        tickets: response.data.tickets || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };
    } catch (error) {
      console.error('❌ getEventTickets error:', error.message);
      throw error;
    }
  }

  // Get ticket groups for an event (for seatmap)
  async getEventTicketGroups(eventId, page = 1, limit = 100) {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(`ticket-groups-${eventId}`, { page, limit });
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      const params = { 
        page, 
        per_page: Math.min(limit, 100),
        event_id: eventId,
        state: 'available', // Only get available tickets
        include_tevo_section_mappings: true, // Include TEvo Section Mappings for seatmaps-client
        lightweight: false // Get detailed information needed for seatmap
      };
      
      console.log(`🎯 Fetching ticket groups for event ${eventId}:`, params);
      const response = await this.client.get(`/ticket_groups`, { params });

      // Log the full response to see if it contains configuration data
      console.log(`📋 Ticket groups response structure:`, {
        hasTicketGroups: !!response.data.ticket_groups,
        ticketGroupsCount: response.data.ticket_groups?.length || 0,
        hasConfiguration: !!response.data.configuration,
        hasConfigurationId: !!response.data.configuration_id,
        hasVenueConfiguration: !!response.data.venue_configuration,
        responseKeys: Object.keys(response.data)
      });

      const result = {
        ticketGroups: response.data.ticket_groups || [],
        configurationId: response.data.configuration_id || response.data.configuration?.id || response.data.venue_configuration?.id || null,
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };

      // Cache the response
      this.setCachedResponse(cacheKey, result);
      
      console.log(`✅ Retrieved ${result.ticketGroups.length} ticket groups for event ${eventId}`);
      return result;
    } catch (error) {
      console.error('❌ getEventTicketGroups error:', error.message);
      throw error;
    }
  }

  // Get seatmap data for an event (venue and configuration info)
  async getEventSeatmapData(eventId) {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(`seatmap-${eventId}`, {});
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      console.log(`🗺️ Fetching seatmap data for event ${eventId}`);

      // Get the event details to extract venue and configuration information
      const eventResponse = await this.client.get(`/events/${eventId}`);
      const event = eventResponse.data;

      if (!event) {
        throw new Error('Event not found');
      }

      // Extract venueId and configurationId directly from the event response
      const venueId = event.venue?.id;
      const configurationId = event.configuration?.id;

      console.log(`📋 Event data structure:`, {
        hasVenue: !!event.venue,
        venueId: venueId,
        hasConfiguration: !!event.configuration,
        configurationId: configurationId,
        eventKeys: Object.keys(event)
      });

      if (!venueId) {
        throw new Error('Venue information not found in event data');
      }

      if (!configurationId) {
        console.log('⚠️ Configuration ID not found in event, trying alternative methods...');

        // Try to get configuration from ticket groups as fallback
        try {
          const ticketGroupsResponse = await this.getEventTicketGroups(eventId, 1, 1);
          if (ticketGroupsResponse.configurationId) {
            console.log(`✅ Found configuration ID from ticket groups: ${ticketGroupsResponse.configurationId}`);
            configurationId = ticketGroupsResponse.configurationId;
          }
        } catch (ticketGroupsError) {
          console.log('⚠️ Could not get configuration from ticket groups:', ticketGroupsError.message);
        }

        // If still no configuration, try venue configurations
        if (!configurationId) {
          try {
            console.log(`🏟️ Fetching venue configurations for venue ${venueId}`);
            const venueResponse = await this.client.get(`/venues/${venueId}`);
            const venueDetails = venueResponse.data;

            if (venueDetails.configurations && venueDetails.configurations.length > 0) {
              configurationId = venueDetails.configurations[0].id;
              console.log(`🎯 Found configuration from venue: ${configurationId}`);
            }
          } catch (venueError) {
            console.log('⚠️ Could not fetch venue configurations:', venueError.message);
          }
        }
      }

      const result = {
        venueId: venueId.toString(),
        configurationId: configurationId ? configurationId.toString() : null,
        venueName: event.venue?.name || 'Unknown Venue',
        venueCity: event.venue?.city,
        venueState: event.venue?.state,
        event: {
          id: event.id,
          name: event.name,
          occurs_at: event.occurs_at
        }
      };

      // Cache the response for longer since venue configuration doesn't change often
      if (this.cacheTimeout > 0) {
        this.requestCache.set(cacheKey, {
          data: result,
          timestamp: Date.now()
        });
      }

      console.log(`✅ Retrieved seatmap data for event ${eventId}: venue ${result.venueId}, config ${result.configurationId}`);
      return result;
    } catch (error) {
      console.error('❌ getEventSeatmapData error:', error.message);
      throw error;
    }
  }

  // Get categories with pagination and proper error handling
  async getCategories(page = 1, limit = 100) {
    try {
      const params = {
        page,
        per_page: Math.min(limit, 100), // API limit is 100
        order_by: 'name' // Sort alphabetically
      };

      // Check cache in development mode
      const cacheKey = this.getCacheKey('categories', { page, limit });
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      console.log(`📂 Fetching categories: page ${page}, limit ${limit}`);
      const response = await this.client.get('/categories', { params });

      const categories = response.data.categories || [];
      console.log(`✅ Fetched ${categories.length} categories from TicketEvolution API`);

      const result = {
        categories,
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        }
      };

      // Cache the response in development mode
      this.setCachedResponse(cacheKey, result);

      return result;
    } catch (error) {
      console.error('❌ getCategories error:', error.message);
      console.error('   Status:', error.response?.status);
      console.error('   Data:', error.response?.data);
      throw error;
    }
  }

  // Get performers
  async getPerformers(page = 1, limit = 20) {
    try {
      const params = { page, per_page: Math.min(limit, 100) };
      const response = await this.client.get('/performers', { params });

      return {
        performers: response.data.performers || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };
    } catch (error) {
      console.error('❌ getPerformers error:', error.message);
      throw error;
    }
  }

  // Get venues
  async getVenues(page = 1, limit = 20) {
    try {
      const params = { page, per_page: Math.min(limit, 100) };
      const response = await this.client.get('/venues', { params });

      return {
        venues: response.data.venues || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };
    } catch (error) {
      console.error('❌ getVenues error:', error.message);
      throw error;
    }
  }

  // Get a single ticket group by ID (for availability/price checks)
  async getTicketGroup(ticketGroupId) {
    try {
      if (!ticketGroupId) {
        throw new Error('ticketGroupId is required');
      }

      // Try cache first in development to reduce API calls
      const cacheKey = this.getCacheKey(`ticket-group-${ticketGroupId}`, {});
      const cached = this.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await this.client.get(`/ticket_groups/${ticketGroupId}`);
      const ticketGroup = response.data.ticket_group || response.data;

      if (!ticketGroup || !ticketGroup.id) {
        throw new Error('Ticket group not found');
      }

      this.setCachedResponse(cacheKey, ticketGroup);
      return ticketGroup;
    } catch (error) {
      console.error('❌ getTicketGroup error:', error.message);
      throw this.handleError(error);
    }
  }

  // Generate signature for authenticated endpoints (like v10 orders)
  generateSignature(method, path, body = '') {
    if (!this.apiSecret) {
      throw new Error('API secret is required for authenticated endpoints');
    }
    const message = [method.toUpperCase(), path, body].join(':');
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('base64');
  }

  // Create authenticated request for TEvo orders
  async authenticatedRequest(method, path, data = null) {
    const body = data ? JSON.stringify(data) : '';
    const signature = this.generateSignature(method, path, body);
    
    const config = {
      method: method.toLowerCase(),
      url: `${this.baseURL}${path}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Token': this.apiToken,
        'X-Signature': signature,
        'Accept': 'application/vnd.ticketevolution.api+json; version=10',
      },
      timeout: this.timeout,
    };

    if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('❌ TEvo authenticated request error:', error.message);
      throw this.handleError(error);
    }
  }

  // Create Ticket Evolution order (Affiliate checkout)
  async createOrder(orderData) {
    try {
      console.log('🛒 Creating TEvo order:', JSON.stringify(orderData, null, 2));
      
      const response = await this.authenticatedRequest('POST', '/v10/orders', orderData);
      
      console.log('✅ Order created successfully:', response.order?.id);
      return response;
    } catch (error) {
      console.error('❌ createOrder error:', error.message);
      throw error;
    }
  }

  // Create or get TEvo client for buyer
  async createClient(clientData) {
    try {
      console.log('👤 Creating TEvo client:', clientData);
      
      const response = await this.client.post('/clients', { client: clientData });
      
      console.log('✅ Client created:', response.data.client?.id);
      return response.data.client;
    } catch (error) {
      console.error('❌ createClient error:', error.message);
      throw error;
    }
  }

  // Get shipping suggestions for delivery options
  async getShippingSuggestions(eventId, zipCode) {
    try {
      const params = {
        event_id: eventId,
        zip_code: zipCode,
      };
      
      const response = await this.client.get('/shipments/suggestions', { params });
      
      return response.data.suggestions || [];
    } catch (error) {
      console.error('❌ getShippingSuggestions error:', error.message);
      throw error;
    }
  }

  // Create tax quote for order calculation
  async createTaxQuote(taxData) {
    try {
      console.log('💰 Creating tax quote:', taxData);
      
      const response = await this.client.post('/tax_quotes', { tax_quote: taxData });
      
      console.log('✅ Tax quote created:', response.data.tax_quote?.signature);
      return response.data.tax_quote;
    } catch (error) {
      console.error('❌ createTaxQuote error:', error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await this.client.get('/categories', { params: { per_page: 1 } });
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        statusCode: response.status,
        message: 'TicketEvolution API is accessible',
        mode: 'api',
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message,
        mode: 'api',
        error: error.constructor.name,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new TicketEvolutionService();

