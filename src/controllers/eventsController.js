const ticketEvolutionService = require('../services/ticketEvolutionService');
const supabaseService = require('../services/supabaseService');

class EventsController {
    // Get all events with optional filtering - handles all event requests in one function
  async getEvents(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    try {
      // Extract only essential parameters
      const {
        page = 1, 
        limit = 20, 
        category_id, 
        category_slug, 
        ip, 
        lat, 
        lon, 
        within,
        only_with_available_tickets
      } = req.query;

      // Build filters object
      const filters = {};
      const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

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

      // Location filters - only add if provided
      let hasLocationFilter = false;
      
      // IP geolocation
      if (ip) {
        filters.ip = (ip === 'auto' && clientIP && clientIP !== '127.0.0.1' && clientIP !== '::1') ? clientIP : ip;
        hasLocationFilter = true;
      }

      // Lat/Lon coordinates
      if (lat && lon) {
        filters.lat = parseFloat(lat);
        filters.lon = parseFloat(lon);
        hasLocationFilter = true;
      }

      // Set radius only if location filter is provided and within is specified
      if (hasLocationFilter && within) {
        filters.within = parseInt(within);
        console.log(`[REQUEST ${requestId}] Using specified radius: ${filters.within} miles`);
      } else if (hasLocationFilter) {
        console.log(`[REQUEST ${requestId}] Location filter provided but no radius specified - fetching all events`);
      }

      // Always enforce available tickets only
      filters.only_with_available_tickets = true;

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      console.log(`[REQUEST ${requestId}] Events API called - filters:`, Object.keys(filters));

      const result = await ticketEvolutionService.getEvents(filters, pageNum, limitNum, requestId);

      res.json({
        success: true,
        data: {
          events: result.events,
          pagination: result.pagination,
          filters,
          locationContext: result.locationContext,
          requestId
        },
      });

      console.log(`[REQUEST ${requestId}] Completed in ${Date.now() - startTime}ms - ${result.events.length} events returned`);

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

  // Clear cache endpoint for debugging
  async clearCache(req, res) {
    try {
      const { pattern } = req.query;
      const ticketEvolutionService = require('../services/ticketEvolutionService');
      
      ticketEvolutionService.clearCache(pattern);
      
      res.json({
        success: true,
        message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error clearing cache:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache',
        error: error.message
      });
    }
  }
}

module.exports = new EventsController();

