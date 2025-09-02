const ticketEvolutionService = require('../services/ticketEvolutionService');

class EventsController {
  // Get all events with optional filtering
  async getEvents(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    console.log('🌐 [REQUEST]', requestId, '- Events API called');
    console.log('   Client IP:', req.ip || req.connection.remoteAddress);
    console.log('   User Agent:', req.get('User-Agent')?.substring(0, 100) + '...');
    console.log('   Method:', req.method);
    console.log('   URL:', req.originalUrl);

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

      console.log('📋 [REQUEST]', requestId, '- Query parameters:');
      console.log('   page:', page, 'limit:', limit);
      console.log('   category:', category || 'none');
      console.log('   city:', city || 'none', 'state:', state || 'none');
      console.log('   search:', search || 'none');
      console.log('   location:', location || 'none');

      // Build filters object - ENABLE LOCATION AND CATEGORY FILTERING
      const filters = {};

      console.log('🔄 [FILTERING]', 'Enabling location and category filtering');

      // Category filtering using TicketEvolution API format
      if (category) {
        // Map common category names to TicketEvolution category IDs
        const categoryMapping = {
          'Concerts': '1', // Music/Concerts category
          'Sports': '2',   // Sports category
          'Theater': '3',  // Theater category
          'Comedy': '4',   // Comedy category
          'Music': '1',    // Alternative mapping
          'Football': '2', // Alternative mapping
          'Basketball': '2', // Alternative mapping
          'Baseball': '2',   // Alternative mapping
          'Hockey': '2'     // Alternative mapping
        };

        const categoryId = categoryMapping[category] || category;
        filters.category_id = categoryId;
        console.log('🎭 [CATEGORY]', 'Category:', category, '-> ID:', categoryId);
      }

      // Venue and performer filtering
      if (venue) {
        filters.venue_id = venue;
        console.log('🏟️ [VENUE]', 'Venue ID:', venue);
      }
      if (performer) {
        filters.performer_id = performer;
        console.log('🎤 [PERFORMER]', 'Performer ID:', performer);
      }

      // Location-based search using 'q' parameter
      if (city || state) {
        const locationParts = [];
        if (city) locationParts.push(city);
        if (state) locationParts.push(state);
        const locationQuery = locationParts.join(', ');

        if (search) {
          // Combine search term with location
          filters.q = `${search} ${locationQuery}`;
          console.log('🔍 [SEARCH+LOCATION]', 'Combined query:', filters.q);
        } else {
          // Location-only search
          filters.q = locationQuery;
          console.log('📍 [LOCATION]', 'Location query:', filters.q);
        }
      } else if (search) {
        // Search-only query
        filters.q = search;
        console.log('🔍 [SEARCH]', 'Search query:', filters.q);
      }

      console.log('🎯 [FILTERS]', 'Final filters:', JSON.stringify(filters, null, 2));

      // Date filtering
      if (dateFrom) filters['occurs_at.gte'] = dateFrom;
      if (dateTo) filters['occurs_at.lte'] = dateTo;

      // Handle legacy location format if provided as "City, State" string
      if (location && !city && !state) {
        const locationParts = location.split(',').map(part => part.trim());
        if (locationParts.length >= 1) {
          const parsedCity = locationParts[0];
          const parsedState = locationParts[1] || '';
          const locationQuery = [parsedCity, parsedState].filter(Boolean).join(', ');

          // Use the location as a search query
          if (filters.q) {
            filters.q += ` ${locationQuery}`;
          } else {
            filters.q = locationQuery;
          }

          console.log('📍 [LEGACY]', 'Parsed legacy location format:', location, '->', filters.q);
        }
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      console.log('🎯 [REQUEST]', requestId, '- Final filters:', JSON.stringify(filters, null, 2));
      console.log('📄 [REQUEST]', requestId, '- Pagination: page', pageNum, 'limit', limitNum);

      // Log summary of applied filters for debugging
      const appliedFilters = [];
      if (filters.category_id) appliedFilters.push(`Category: ${filters.category_id}`);
      if (filters.venue_id) appliedFilters.push(`Venue: ${filters.venue_id}`);
      if (filters.performer_id) appliedFilters.push(`Performer: ${filters.performer_id}`);
      if (filters.q) appliedFilters.push(`Search: "${filters.q}"`);
      if (filters['occurs_at.gte']) appliedFilters.push(`From: ${filters['occurs_at.gte']}`);
      if (filters['occurs_at.lte']) appliedFilters.push(`To: ${filters['occurs_at.lte']}`);

      if (appliedFilters.length > 0) {
        console.log('✅ [FILTERS]', 'Applied filters:', appliedFilters.join(' | '));
      } else {
        console.log('📋 [FILTERS]', 'No filters applied - fetching ALL events');
      }

      const result = await ticketEvolutionService.getEvents(filters, pageNum, limitNum);

      const processingTime = Date.now() - startTime;
      console.log('✅ [RESPONSE]', requestId, '- Events fetched successfully');
      console.log('   Processing time:', processingTime + 'ms');
      console.log('   Events returned:', result.events?.length || 0);
      console.log('   Total available:', result.pagination?.total_entries || 0);

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

      console.log('📤 [RESPONSE]', requestId, '- Sending response');
      console.log('   Status: 200 OK');
      console.log('   Events in response:', events.length);
      console.log('   Response size:', JSON.stringify({ events, pagination: result.pagination }).length, 'bytes');

      res.json({
        success: true,
        data: {
          events,
          pagination: result.pagination,
          filters: filters,
        },
      });

      const totalTime = Date.now() - startTime;
      console.log('🏁 [REQUEST]', requestId, '- Request completed in', totalTime + 'ms');

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ [ERROR]', requestId, '- Error in getEvents controller');
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      console.error('   Stack trace:', error.stack);
      console.error('   Processing time before error:', totalTime + 'ms');
      console.error('   Request details:', {
        method: req.method,
        url: req.originalUrl,
        query: req.query,
        ip: req.ip
      });

      res.status(500).json({
        success: false,
        message: 'Failed to fetch events',
        error: error.message,
        requestId: requestId
      });
    }
  }

  // Get single event by ID
  async getEvent(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    console.log('🎭 [REQUEST]', requestId, '- Single event API called');
    console.log('   Event ID from params:', req.params.eventId);
    console.log('   Client IP:', req.ip || req.connection.remoteAddress);

    try {
      const { eventId } = req.params;

      if (!eventId || isNaN(eventId)) {
        console.log('❌ [VALIDATION]', requestId, '- Invalid event ID:', eventId);
        return res.status(400).json({
          success: false,
          message: 'Valid event ID is required',
          requestId: requestId
        });
      }

      console.log('🔍 [REQUEST]', requestId, '- Fetching event:', eventId);

      const event = await ticketEvolutionService.getEvent(parseInt(eventId));

      const processingTime = Date.now() - startTime;
      console.log('✅ [RESPONSE]', requestId, '- Event fetched successfully');
      console.log('   Event ID:', event.id);
      console.log('   Event name:', event.name || 'N/A');
      console.log('   Processing time:', processingTime + 'ms');

      res.json({
        success: true,
        data: event,
        requestId: requestId
      });

      const totalTime = Date.now() - startTime;
      console.log('🏁 [REQUEST]', requestId, '- Request completed in', totalTime + 'ms');

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ [ERROR]', requestId, '- Error in getEvent controller');
      console.error('   Event ID:', req.params.eventId);
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      console.error('   Processing time before error:', totalTime + 'ms');

      // Handle specific error types
      if (error.message.includes('not found') || error.message.includes('404')) {
        console.log('📭 [ERROR]', requestId, '- Event not found');
        return res.status(404).json({
          success: false,
          message: 'Event not found',
          requestId: requestId
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event',
        error: error.message,
        requestId: requestId
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

