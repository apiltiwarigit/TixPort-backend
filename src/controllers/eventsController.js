const ticketEvolutionService = require('../services/ticketEvolutionService');

class EventsController {
    // Get all events with optional filtering - handles all event requests in one function
  async getEvents(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    try {
      // Extract all supported parameters
      const {
        page = 1, limit = 20, name, venue_id, performer_id, primary_performer,
        category_id, category_slug, category_tree, q, fuzzy, occurs_at, updated_at,
        popularity_score, short_term_popularity_score, office_id,
        lat, lon, within = 60, ip, postal_code, city_state, country_code,
        only_with_tickets, only_with_available_tickets, only_discounted,
        by_time, order_by, minPrice, maxPrice
      } = req.query;

      // Build filters object
      const filters = {};
      const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

      // Basic filters
      if (name) filters.name = name;
      if (venue_id) filters.venue_id = venue_id;
      if (performer_id) {
        filters.performer_id = performer_id;
        if (primary_performer !== undefined) filters.primary_performer = primary_performer === 'true';
      }
      
      // Handle category filtering - support both ID and slug
      if (category_id) {
        filters.category_id = category_id;
      } else if (category_slug) {
        // Convert category slug to category ID using the ticketEvolution service
        try {
          const categoryId = await this.getCategoryIdFromSlug(category_slug);
          if (categoryId) {
            filters.category_id = categoryId;
            console.log(`🏷️ [${requestId}] Mapped category slug "${category_slug}" to ID: ${categoryId}`);
          } else {
            console.warn(`⚠️ [${requestId}] Category slug "${category_slug}" not found, proceeding without category filter`);
          }
        } catch (error) {
          console.warn(`⚠️ [${requestId}] Failed to map category slug "${category_slug}":`, error.message);
          // Continue without category filter rather than failing the request
        }
      }
      
      if (category_tree !== undefined) filters.category_tree = category_tree === 'true';

      // Search and location
      if (q) filters.q = q;
      if (fuzzy !== undefined && q) filters.fuzzy = fuzzy === 'true';

      // Geolocation - handle IP auto-detection
      if (ip) {
        filters.ip = (ip === 'auto' && clientIP && clientIP !== '127.0.0.1' && clientIP !== '::1') ? clientIP : ip;
      } else if (!lat && !lon && !postal_code && !city_state && !q && clientIP && clientIP !== '127.0.0.1' && clientIP !== '::1') {
        // Auto-enable IP geolocation if no location specified
        filters.ip = clientIP;
      }

      if (lat && lon) {
        filters.lat = parseFloat(lat);
        filters.lon = parseFloat(lon);
      }
      if (postal_code) filters.postal_code = postal_code;
      if (city_state) filters.city_state = city_state;
      if (country_code) filters.country_code = country_code;

      // Set radius for geolocation searches
      if (filters.ip || filters.lat || filters.postal_code || filters.city_state) {
        filters.within = parseInt(within) || 60;
      }

      // Date and time filters
      if (occurs_at) filters.occurs_at = occurs_at;
      if (req.query['occurs_at.gte']) filters['occurs_at.gte'] = req.query['occurs_at.gte'];
      if (req.query['occurs_at.lte']) filters['occurs_at.lte'] = req.query['occurs_at.lte'];
      if (updated_at) filters.updated_at = updated_at;

      // Popularity and other filters
      if (popularity_score) filters.popularity_score = parseFloat(popularity_score);
      if (short_term_popularity_score) filters.short_term_popularity_score = parseFloat(short_term_popularity_score);
      if (office_id) filters.office_id = office_id;
      if (only_with_tickets !== undefined) filters.only_with_tickets = only_with_tickets === 'true';
      if (only_with_available_tickets !== undefined) filters.only_with_available_tickets = only_with_available_tickets === 'true';
      if (only_discounted !== undefined) filters.only_discounted = only_discounted === 'true';
      if (by_time && ['day', 'night'].includes(by_time)) filters.by_time = by_time;
      if (order_by) filters.order_by = order_by;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      console.log(`[REQUEST ${requestId}] Events API called - filters:`, Object.keys(filters));

      const result = await ticketEvolutionService.getEvents(filters, pageNum, limitNum);

      // Apply client-side price filtering
      let events = result.events;
      if (minPrice || maxPrice) {
        events = events.filter(event => {
          const minPriceNum = parseFloat(minPrice);
          const maxPriceNum = parseFloat(maxPrice);
          const eventMinPrice = event.min_ticket_price;
          const eventMaxPrice = event.max_ticket_price;

          if (minPrice && eventMaxPrice && eventMaxPrice < minPriceNum) return false;
          if (maxPrice && eventMinPrice && eventMinPrice > maxPriceNum) return false;
          return true;
        });
      }

      res.json({
        success: true,
        data: {
          events,
          pagination: result.pagination,
          filters,
          requestId
        },
      });

      console.log(`[REQUEST ${requestId}] Completed in ${Date.now() - startTime}ms - ${events.length} events returned`);

    } catch (error) {
      console.error(`[REQUEST ${requestId}] Error in getEvents:`, error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch events',
        error: error.message,
        requestId
      });
    }
  }

  // Get single event by ID
  async getSingleEvent(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    try {
      const { eventId } = req.params;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid event ID is required',
          requestId
        });
      }

      console.log(`[REQUEST ${requestId}] Single event API called for ID: ${eventId}`);

      const event = await ticketEvolutionService.getEvent(parseInt(eventId));

      res.json({
        success: true,
        data: event,
        requestId
      });

      console.log(`[REQUEST ${requestId}] Completed in ${Date.now() - startTime}ms - Event "${event.name}" returned`);

    } catch (error) {
      console.error(`[REQUEST ${requestId}] Error in getSingleEvent:`, error.message);
      
      if (error.message.includes('not found') || error.message.includes('404')) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
          requestId
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event',
        error: error.message,
        requestId
      });
    }
  }

  // Helper method to convert category slug to category ID
  async getCategoryIdFromSlug(slug) {
    try {
      const ticketEvolutionService = require('../services/ticketEvolutionService');
      
      // Get all categories from the API
      const result = await ticketEvolutionService.getCategories();
      
      // Find category by slug (case-insensitive)
      const category = result.categories.find(cat => {
        const categorySlug = cat.name ? cat.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : `category-${cat.id}`;
        return categorySlug === slug.toLowerCase();
      });
      
      return category ? category.id : null;
    } catch (error) {
      console.error('Error getting category ID from slug:', error.message);
      throw error;
    }
  }
}

module.exports = new EventsController();

