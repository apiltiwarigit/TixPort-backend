const axios = require('axios');
const config = require('../config/config');

class TicketEvolutionService {
  constructor() {
    this.baseURL = config.ticketEvolution.apiUrl;
    this.apiToken = config.ticketEvolution.apiToken;
    this.apiSecret = config.ticketEvolution.apiSecret;
    this.environment = config.ticketEvolution.environment;
    this.timeout = config.ticketEvolution.timeout;

    if (!this.apiToken) {
      throw new Error('TICKET_EVOLUTION_API_TOKEN is required. Please set the environment variable.');
    }

    console.log(`🎫 TicketEvolution: ${this.environment.toUpperCase()} mode initialized`);

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
      (error) => {
        console.error('❌ TicketEvolution API Error:', error.response?.status, error.message);
        return Promise.reject(this.handleError(error));
      }
    );
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
  async getEvents(filters = {}, page = 1, limit = 20) {

    try {
      // Build API parameters
      const apiParams = {
        page,
        per_page: Math.min(limit, 100),
      };

      // Map filter parameters to API
      const paramMappings = {
        name: 'name', venue_id: 'venue_id', performer_id: 'performer_id',
        primary_performer: 'primary_performer', category_id: 'category_id',
        category_tree: 'category_tree', office_id: 'office_id', q: 'q',
        fuzzy: 'fuzzy', occurs_at: 'occurs_at', 'occurs_at.gte': 'occurs_at.gte',
        'occurs_at.lte': 'occurs_at.lte', updated_at: 'updated_at',
        popularity_score: 'popularity_score', short_term_popularity_score: 'short_term_popularity_score',
        lat: 'lat', lon: 'lon', within: 'within', ip: 'ip',
        postal_code: 'postal_code', city_state: 'city_state', country_code: 'country_code',
        only_with_tickets: 'only_with_tickets', only_with_available_tickets: 'only_with_available_tickets',
        only_discounted: 'only_discounted', by_time: 'by_time', order_by: 'order_by'
      };

      Object.entries(paramMappings).forEach(([filter, param]) => {
        if (filters[filter] !== undefined && filters[filter] !== null && filters[filter] !== '') {
          apiParams[param] = filters[filter];
        }
      });

      const response = await this.client.get('/events', { params: apiParams });

      return {
        events: response.data.events || [],
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        },
      };
    } catch (error) {
      console.error('❌ getEvents error:', error.message);
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

  // Get categories with pagination and proper error handling
  async getCategories(page = 1, limit = 100) {
    try {
      const params = {
        page,
        per_page: Math.min(limit, 100), // API limit is 100
        order_by: 'name' // Sort alphabetically
      };

      console.log(`📂 Fetching categories: page ${page}, limit ${limit}`);
      const response = await this.client.get('/categories', { params });

      const categories = response.data.categories || [];
      console.log(`✅ Fetched ${categories.length} categories from TicketEvolution API`);

      return {
        categories,
        pagination: {
          current_page: response.data.current_page || page,
          per_page: response.data.per_page || limit,
          total_entries: response.data.total_entries || 0,
          total_pages: Math.ceil((response.data.total_entries || 0) / limit),
        }
      };
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

