const ticketEvolutionService = require('../services/ticketEvolutionService');

class EventsController {
  // Get all events with optional filtering
  async getEvents(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        location,
        dateFrom,
        dateTo,
        minPrice,
        maxPrice,
        search,
        city,
        state,
        venue,
        performer,
      } = req.query;

      // Build filters object
      const filters = {};
      
      if (category) filters['category.name'] = category;
      if (city) filters['venue.city'] = city;
      if (state) filters['venue.state'] = state;
      if (venue) filters['venue.id'] = venue;
      if (performer) filters['performer.id'] = performer;
      if (search) filters.q = search;
      if (dateFrom) filters['occurs_at.gte'] = dateFrom;
      if (dateTo) filters['occurs_at.lte'] = dateTo;

      // Handle location parsing if provided as "City, State" format
      if (location && !city && !state) {
        const locationParts = location.split(',').map(part => part.trim());
        if (locationParts.length >= 1) {
          filters['venue.city'] = locationParts[0];
        }
        if (locationParts.length >= 2) {
          filters['venue.state'] = locationParts[1];
        }
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.getEvents(filters, pageNum, limitNum);

      // Filter by price if specified (client-side filtering since API might not support it)
      let events = result.events;
      if (minPrice || maxPrice) {
        events = events.filter(event => {
          const eventMinPrice = event.min_ticket_price;
          const eventMaxPrice = event.max_ticket_price;
          
          if (minPrice && eventMaxPrice && eventMaxPrice < parseFloat(minPrice)) {
            return false;
          }
          if (maxPrice && eventMinPrice && eventMinPrice > parseFloat(maxPrice)) {
            return false;
          }
          return true;
        });
      }

      res.json({
        success: true,
        data: {
          events,
          pagination: result.pagination,
          filters: filters,
        },
      });
    } catch (error) {
      console.error('Error in getEvents:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch events',
        error: error.message,
      });
    }
  }

  // Get single event by ID
  async getEvent(req, res) {
    try {
      const { eventId } = req.params;
      
      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid event ID is required',
        });
      }

      const event = await ticketEvolutionService.getEvent(parseInt(eventId));

      res.json({
        success: true,
        data: event,
      });
    } catch (error) {
      console.error(`Error in getEvent for ID ${req.params.eventId}:`, error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'Event not found',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event',
        error: error.message,
      });
    }
  }

  // Get events by category
  async getEventsByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!categoryId || isNaN(categoryId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid category ID is required',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.getEventsByCategory(
        parseInt(categoryId),
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(`Error in getEventsByCategory for category ${req.params.categoryId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch events by category',
        error: error.message,
      });
    }
  }

  // Get events by location
  async getEventsByLocation(req, res) {
    try {
      const { city, state, page = 1, limit = 20 } = req.query;

      if (!city) {
        return res.status(400).json({
          success: false,
          message: 'City is required',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.getEventsByLocation(
        city,
        state,
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error in getEventsByLocation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch events by location',
        error: error.message,
      });
    }
  }

  // Search events
  async searchEvents(req, res) {
    try {
      const { q, page = 1, limit = 20 } = req.query;

      if (!q || q.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.searchEvents(
        q.trim(),
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error in searchEvents:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search events',
        error: error.message,
      });
    }
  }

  // Get events by performer
  async getEventsByPerformer(req, res) {
    try {
      const { performerId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!performerId || isNaN(performerId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid performer ID is required',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.getEventsByPerformer(
        parseInt(performerId),
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(`Error in getEventsByPerformer for performer ${req.params.performerId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch events by performer',
        error: error.message,
      });
    }
  }

  // Get events by venue
  async getEventsByVenue(req, res) {
    try {
      const { venueId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!venueId || isNaN(venueId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid venue ID is required',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.getEventsByVenue(
        parseInt(venueId),
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(`Error in getEventsByVenue for venue ${req.params.venueId}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch events by venue',
        error: error.message,
      });
    }
  }
}

module.exports = new EventsController();
