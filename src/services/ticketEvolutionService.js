const axios = require('axios');
const config = require('../config/config');
const mockDataService = require('./mockDataService');

class TicketEvolutionService {
  constructor() {
    this.baseURL = config.ticketEvolution.apiUrl;
    this.apiToken = config.ticketEvolution.apiToken;
    this.apiSecret = config.ticketEvolution.apiSecret;
    this.environment = config.ticketEvolution.environment;
    this.timeout = config.ticketEvolution.timeout;
    this.useMockData = config.ticketEvolution.useMockData;
    
    // If no API token, log warning
    if (this.useMockData) {
      console.log('⚠️  No API Token Provided - API calls will fail');
      console.log('💡 To use Ticket Evolution API, get free sandbox credentials');
      console.log('🔗 Visit: https://ticketevolution.com/developers');
      console.log('🔧 Set TICKET_EVOLUTION_API_TOKEN environment variable');
      return;
    }
    
    console.log(`🎫 Using Ticket Evolution API (${this.environment.toUpperCase()} Environment)`);
    console.log(`📡 API URL: ${this.baseURL}`);
    
    if (this.environment === 'sandbox') {
      console.log('🧪 SANDBOX MODE: Perfect for development and testing!');
    }
    
    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': `Token token=${this.apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.ticketevolution.api+json; version=9',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (request) => {
        console.log(`TicketEvolution API Request: ${request.method?.toUpperCase()} ${request.url}`);
        return request;
      },
      (error) => {
        console.error('TicketEvolution API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`TicketEvolution API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('TicketEvolution API Response Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          data: error.response?.data,
        });
        return Promise.reject(this.handleError(error));
      }
    );
  }

  // Error handler
  handleError(error) {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      switch (status) {
        case 401:
          return new Error('Invalid API token or unauthorized access');
        case 403:
          return new Error('Access forbidden - check API permissions');
        case 404:
          return new Error('Resource not found');
        case 429:
          return new Error('Rate limit exceeded - please try again later');
        case 500:
          return new Error('TicketEvolution API server error');
        default:
          return new Error(data?.message || `API error: ${status}`);
      }
    } else if (error.request) {
      // Request was made but no response received
      return new Error('No response from TicketEvolution API - check connection');
    } else {
      // Something else happened
      return new Error(error.message || 'Unknown error occurred');
    }
  }

  // Get events with filtering and pagination
  async getEvents(filters = {}, page = 1, limit = 20) {
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const params = {
        page,
        per_page: Math.min(limit, 100), // API max limit
        ...filters,
      };

      const response = await this.client.get('/events', { params });
      
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
      console.error('Error fetching events:', error.message);
      throw error;
    }
  }

  // Get single event by ID
  async getEvent(eventId) {
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const response = await this.client.get(`/events/${eventId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching event ${eventId}:`, error.message);
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
    
    if (this.useMockData) {
      throw new Error('API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.');
    }

    try {
      const params = {
        page,
        per_page: Math.min(limit, 100),
      };

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
      console.error(`Error fetching tickets for event ${eventId}:`, error.message);
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
    // If no API token, return unhealthy status
    if (this.useMockData) {
      return { 
        status: 'unhealthy', 
        message: 'API token not configured. Please set TICKET_EVOLUTION_API_TOKEN environment variable.',
        mode: 'mock'
      };
    }

    try {
      const response = await this.client.get('/categories', { 
        params: { per_page: 1 } 
      });
      return { 
        status: 'healthy', 
        statusCode: response.status,
        message: 'TicketEvolution API is accessible',
        mode: 'api'
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        message: error.message,
        mode: 'api'
      };
    }
  }
}

module.exports = new TicketEvolutionService();

