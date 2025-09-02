const axios = require('axios');
const config = require('../config/config');
const mockDataService = require('./mockDataService');

class TicketEvolutionService {
  constructor() {
    console.log('🚀 Initializing TicketEvolutionService...');

    this.baseURL = config.ticketEvolution.apiUrl;
    this.apiToken = config.ticketEvolution.apiToken;
    this.apiSecret = config.ticketEvolution.apiSecret;
    this.environment = config.ticketEvolution.environment;
    this.timeout = config.ticketEvolution.timeout;
    this.useMockData = config.ticketEvolution.useMockData;

    console.log('📋 Service Configuration:');
    console.log('   Base URL:', this.baseURL);
    console.log('   Environment:', this.environment);
    console.log('   Timeout:', this.timeout + 'ms');
    console.log('   Use Mock Data:', this.useMockData);

    // Environment variables debug
    console.log('🔍 Environment Variables:');
    console.log('   TICKET_EVOLUTION_API_TOKEN:', process.env.TICKET_EVOLUTION_API_TOKEN ? 'SET' : 'NOT SET');
    console.log('   TICKET_EVOLUTION_API_SECRET:', process.env.TICKET_EVOLUTION_API_SECRET ? 'SET' : 'NOT SET');
    console.log('   TICKET_EVOLUTION_API_URL:', process.env.TICKET_EVOLUTION_API_URL || 'DEFAULT (sandbox)');
    console.log('   TICKET_EVOLUTION_ENV:', process.env.TICKET_EVOLUTION_ENV || 'DEFAULT (sandbox)');

    // If no API token, log warning
    if (this.useMockData) {
      console.log('⚠️  No API Token Provided - API calls will fail');
      console.log('💡 To use Ticket Evolution API, get free sandbox credentials');
      console.log('🔗 Visit: https://ticketevolution.com/developers');
      console.log('🔧 Set TICKET_EVOLUTION_API_TOKEN environment variable');

      console.log('📊 Service will use MOCK DATA for all operations');
      return;
    }

    console.log(`🎫 Using Ticket Evolution API (${this.environment.toUpperCase()} Environment)`);
    console.log(`📡 API URL: ${this.baseURL}`);
    console.log(`🔑 API Token: ${this.apiToken ? 'SET (length: ' + this.apiToken.length + ')' : 'NOT SET'}`);

    if (this.environment === 'sandbox') {
      console.log('🧪 SANDBOX MODE: Perfect for development and testing!');
    } else if (this.environment === 'production') {
      console.log('🔴 PRODUCTION MODE: Using live TicketEvolution API!');
    }

    console.log('✅ TicketEvolutionService initialized successfully');

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
        console.log('📤 TicketEvolution API Request:');
        console.log('   Method:', request.method?.toUpperCase());
        console.log('   URL:', request.url);
        console.log('   Full URL:', request.baseURL + request.url);
        console.log('   Headers:', {
          'X-Token': request.headers['X-Token'] ? 'SET (length: ' + request.headers['X-Token'].length + ')' : 'NOT SET',
          'Content-Type': request.headers['Content-Type'],
          'Accept': request.headers['Accept'],
        });

        if (request.params && Object.keys(request.params).length > 0) {
          console.log('   Query Params:', request.params);
        }

        if (request.data) {
          console.log('   Request Body:', typeof request.data === 'object' ? JSON.stringify(request.data, null, 2) : request.data);
        }

        return request;
      },
      (error) => {
        console.error('❌ TicketEvolution API Request Error:', error.message);
        console.error('   Error Details:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log('📥 TicketEvolution API Response:');
        console.log('   Status:', response.status, response.statusText);
        console.log('   URL:', response.config.url);
        console.log('   Response Time:', response.headers['x-response-time'] || 'N/A');

        if (response.data) {
          if (Array.isArray(response.data)) {
            console.log('   Data: Array with', response.data.length, 'items');
          } else if (typeof response.data === 'object') {
            const keys = Object.keys(response.data);
            console.log('   Data Keys:', keys);
            console.log('   Data Sample:', JSON.stringify(response.data, null, 2).substring(0, 500) + '...');
          } else {
            console.log('   Data:', response.data);
          }
        }

        return response;
      },
      (error) => {
        console.error('❌ TicketEvolution API Response Error:');
        console.error('   Status:', error.response?.status, error.response?.statusText);
        console.error('   URL:', error.config?.url);
        console.error('   Error Message:', error.response?.data?.error || error.message);

        if (error.response?.data) {
          console.error('   Full Error Response:', JSON.stringify(error.response.data, null, 2));
        }

        if (error.config) {
          console.error('   Request Config:', {
            method: error.config.method,
            url: error.config.url,
            headers: {
              'X-Token': error.config.headers['X-Token'] ? 'SET' : 'NOT SET',
              'Content-Type': error.config.headers['Content-Type'],
            }
          });
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  // Error handler
  handleError(error) {
    console.error('🔍 [ERROR ANALYSIS] Analyzing error response...');

    if (error.response) {
      // Server responded with error status
      const { status, data, headers } = error.response;
      console.error('   Response status:', status);
      console.error('   Response headers:', headers);
      console.error('   Response data:', JSON.stringify(data, null, 2));

      switch (status) {
        case 401:
          console.error('🔐 Authentication failed - check API token');
          return new Error('Invalid API token or unauthorized access');
        case 403:
          console.error('🚫 Forbidden - check API permissions');
          return new Error('Access forbidden - check API permissions');
        case 404:
          console.error('📭 Resource not found');
          return new Error('Resource not found');
        case 422:
          console.error('📋 Unprocessable entity - check parameter format');
          return new Error(data?.message || 'Invalid parameters sent to API');
        case 429:
          console.error('⏱️ Rate limit exceeded');
          return new Error('Rate limit exceeded - please try again later');
        case 500:
          console.error('💥 Server error from TicketEvolution');
          return new Error('TicketEvolution API server error');
        default:
          console.error('❓ Unknown error status:', status);
          return new Error(data?.message || data?.error || `API error: ${status}`);
      }
    } else if (error.request) {
      // Request was made but no response received
      console.error('🌐 No response received from API');
      console.error('   Request details:', error.request);
      return new Error('No response from TicketEvolution API - check connection');
    } else {
      // Something else happened
      console.error('🤔 Unknown error occurred');
      console.error('   Error details:', error);
      return new Error(error.message || 'Unknown error occurred');
    }
  }

  // Get events with filtering and pagination
  async getEvents(filters = {}, page = 1, limit = 20) {
    console.log('🎪 getEvents called with:');
    console.log('   Filters:', JSON.stringify(filters, null, 2));
    console.log('   Page:', page);
    console.log('   Limit:', limit);

    if (this.useMockData) {
      console.log('📊 Using MOCK DATA for getEvents');
      console.log('   Would fetch from:', this.baseURL + '/events');
      console.log('   With params:', { page, per_page: Math.min(limit, 100), ...filters });

      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      console.log('🔍 Preparing to fetch events from TicketEvolution API...');

      // Convert our internal filter names to TicketEvolution API parameter names
      const apiParams = {
        page,
        per_page: Math.min(limit, 100), // API max limit
      };

      console.log('🔄 [PARAMS]', 'Input filters:', JSON.stringify(filters, null, 2));

      // Only add filters if they exist
      if (Object.keys(filters).length > 0) {
        if (filters.category_id) apiParams.category_id = filters.category_id;
        if (filters.venue_id) apiParams.venue_id = filters.venue_id;
        if (filters.performer_id) apiParams.performer_id = filters.performer_id;
        if (filters.q) apiParams.q = filters.q;
        if (filters['occurs_at.gte']) apiParams['occurs_at.gte'] = filters['occurs_at.gte'];
        if (filters['occurs_at.lte']) apiParams['occurs_at.lte'] = filters['occurs_at.lte'];
      } else {
        console.log('📋 [PARAMS]', 'No filters applied - fetching ALL events');
      }

      console.log('🔄 [PARAMS]', 'Final API params:', JSON.stringify(apiParams, null, 2));

      const params = apiParams;

      const response = await this.client.get('/events', { params });

      console.log('✅ Events fetched successfully!');
      console.log('   Response data keys:', Object.keys(response.data));
      console.log('   Total events returned:', response.data.events?.length || 0);
      console.log('   Total entries in API:', response.data.total_entries || 0);
      console.log('   Current page from API:', response.data.current_page || 'N/A');
      console.log('   Per page from API:', response.data.per_page || 'N/A');

      // Log sample of events if any exist
      if (response.data.events && response.data.events.length > 0) {
        console.log('📋 Sample events:');
        const sampleEvent = response.data.events[0];
        console.log('   First event:', {
          id: sampleEvent.id,
          name: sampleEvent.name,
          venue: sampleEvent.venue?.name,
          occurs_at: sampleEvent.occurs_at
        });
      } else {
        console.log('⚠️ No events returned from API');
      }

      const result = {
        events: response.data.events || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };

      console.log('📦 Returning result with', result.events.length, 'events');
      console.log('   Pagination:', result.pagination);

      return result;
    } catch (error) {
      console.error('❌ Error in getEvents method:');
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      console.error('   Stack trace:', error.stack);
      throw error;
    }
  }

  // Get single event by ID
  async getEvent(eventId) {
    console.log('🎭 getEvent called with:');
    console.log('   Event ID:', eventId);

    if (this.useMockData) {
      console.log('📊 Using MOCK DATA for getEvent');
      console.log('   Would fetch from:', this.baseURL + `/events/${eventId}`);
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      console.log('🔍 Fetching single event from TicketEvolution API...');

      const response = await this.client.get(`/events/${eventId}`);

      console.log('✅ Event fetched successfully!');
      console.log('   Event ID:', response.data.id);
      console.log('   Event Name:', response.data.name || 'N/A');
      console.log('   Venue:', response.data.venue?.name || 'N/A');

      return response.data;
    } catch (error) {
      console.error('❌ Error in getEvent method:');
      console.error('   Event ID:', eventId);
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      throw error;
    }
  }

  // Get events by category
  async getEventsByCategory(categoryId, page = 1, limit = 20) {
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const filters = { 'category.id': categoryId };
      return await this.getEvents(filters, page, limit);
    } catch (error) {
      console.error(`Error fetching events for category ${categoryId}:`, error.message);
      throw error;
    }
  }

  // Search events
  async searchEvents(query, page = 1, limit = 20) {
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const filters = { q: query };
      return await this.getEvents(filters, page, limit);
    } catch (error) {
      console.error(`Error searching events with query "${query}":`, error.message);
      throw error;
    }
  }

  // Get events by performer
  async getEventsByPerformer(performerId, page = 1, limit = 20) {
    try {
      const filters = { 'performer.id': performerId };
      return await this.getEvents(filters, page, limit);
    } catch (error) {
      console.error(`Error fetching events for performer ${performerId}:`, error.message);
      throw error;
    }
  }

  // Get events by venue
  async getEventsByVenue(venueId, page = 1, limit = 20) {
    try {
      const filters = { 'venue.id': venueId };
      return await this.getEvents(filters, page, limit);
    } catch (error) {
      console.error(`Error fetching events for venue ${venueId}:`, error.message);
      throw error;
    }
  }

  // Get events by location
  async getEventsByLocation(city, state, page = 1, limit = 20) {
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const filters = {};
      if (city) filters['venue.city'] = city;
      if (state) filters['venue.state'] = state;
      
      return await this.getEvents(filters, page, limit);
    } catch (error) {
      console.error(`Error fetching events for location ${city}, ${state}:`, error.message);
      throw error;
    }
  }

  // Get tickets for an event
  async getEventTickets(eventId, page = 1, limit = 20) {
    console.log('🎫 getEventTickets called with:');
    console.log('   Event ID:', eventId);
    console.log('   Page:', page);
    console.log('   Limit:', limit);

    if (this.useMockData) {
      console.log('📊 Using MOCK DATA for getEventTickets');
      console.log('   Would fetch from:', this.baseURL + `/events/${eventId}/tickets`);
      console.log('   With params:', { page, per_page: Math.min(limit, 100) });
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      console.log('🔍 Fetching tickets for event from TicketEvolution API...');

      const params = {
        page,
        per_page: Math.min(limit, 100),
      };

      console.log('📋 Request parameters:', params);

      const response = await this.client.get(`/events/${eventId}/tickets`, { params });

      console.log('✅ Event tickets fetched successfully!');
      console.log('   Total tickets returned:', response.data.tickets?.length || 0);
      console.log('   Pagination info:', {
        current_page: response.data.current_page || page,
        per_page: response.data.per_page || limit,
        total_entries: response.data.total_entries || 0,
        total_pages: Math.ceil((response.data.total_entries || 0) / limit),
      });

      const result = {
        tickets: response.data.tickets || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };

      console.log('📦 Returning result with', result.tickets.length, 'tickets');

      return result;
    } catch (error) {
      console.error('❌ Error in getEventTickets method:');
      console.error('   Event ID:', eventId);
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      console.error('   Stack trace:', error.stack);
      throw error;
    }
  }

  // Get categories
  async getCategories() {
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const response = await this.client.get('/categories');
      return response.data.categories || [];
    } catch (error) {
      console.error('Error fetching categories:', error.message);
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
      console.error('Error fetching performers:', error.message);
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
      console.error('Error fetching venues:', error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    console.log('🏥 Health check initiated for TicketEvolution API');

    // If no API token, return unhealthy status
    if (this.useMockData) {
      console.log('📊 Health check: Using mock data mode');
      console.log('   Status: Unhealthy (API token not configured)');
      return {
        status: 'unhealthy',
        message: 'API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.',
        mode: 'mock',
        timestamp: new Date().toISOString()
      };
    }

    console.log('🔍 Performing health check against live API...');
    console.log('   Testing endpoint:', this.baseURL + '/categories');

    try {
      const startTime = Date.now();
      const response = await this.client.get('/categories', {
        params: { per_page: 1 }
      });
      const responseTime = Date.now() - startTime;

      console.log('✅ Health check successful!');
      console.log('   Response time:', responseTime + 'ms');
      console.log('   Status code:', response.status);
      console.log('   Response size:', JSON.stringify(response.data).length, 'bytes');

      return {
        status: 'healthy',
        statusCode: response.status,
        message: 'TicketEvolution API is accessible',
        mode: 'api',
        responseTime: responseTime + 'ms',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Health check failed!');
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);

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

