const ticketEvolutionService = require('../services/ticketEvolutionService');

class TicketsController {
  // Get tickets for a specific event
  async getEventTickets(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    console.log('🎫 [REQUEST]', requestId, '- Event tickets API called');
    console.log('   Event ID from params:', req.params.eventId);
    console.log('   Client IP:', req.ip || req.connection.remoteAddress);
    console.log('   Query params:', req.query);

    try {
      const { eventId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!eventId || isNaN(eventId)) {
        console.log('❌ [VALIDATION]', requestId, '- Invalid event ID:', eventId);
        return res.status(400).json({
          success: false,
          message: 'Valid event ID is required',
          requestId: requestId
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      console.log('🎫 [REQUEST]', requestId, '- Fetching tickets for event:', eventId);
      console.log('   Page:', pageNum, 'Limit:', limitNum);

      const result = await ticketEvolutionService.getEventTickets(
        parseInt(eventId),
        pageNum,
        limitNum
      );

      const processingTime = Date.now() - startTime;
      console.log('✅ [RESPONSE]', requestId, '- Event tickets fetched successfully');
      console.log('   Tickets returned:', result.tickets?.length || 0);
      console.log('   Total available:', result.pagination?.total_entries || 0);
      console.log('   Processing time:', processingTime + 'ms');

      res.json({
        success: true,
        data: result,
        requestId: requestId
      });

      const totalTime = Date.now() - startTime;
      console.log('🏁 [REQUEST]', requestId, '- Request completed in', totalTime + 'ms');

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ [ERROR]', requestId, '- Error in getEventTickets controller');
      console.error('   Event ID:', req.params.eventId);
      console.error('   Error type:', error.constructor.name);
      console.error('   Error message:', error.message);
      console.error('   Processing time before error:', totalTime + 'ms');

      if (error.message.includes('not found') || error.message.includes('404')) {
        console.log('📭 [ERROR]', requestId, '- Event not found or no tickets available');
        return res.status(404).json({
          success: false,
          message: 'Event not found or no tickets available',
          requestId: requestId
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event tickets',
        error: error.message,
        requestId: requestId
      });
    }
  }

  // Get ticket groups for seatmap
  async getEventTicketGroups(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    console.log('🎯 [REQUEST]', requestId, '- Event ticket groups for seatmap API called');
    console.log('   Event ID from params:', req.params.eventId);

    try {
      const { eventId } = req.params;
      const { page = 1, limit = 100 } = req.query;

      if (!eventId || isNaN(eventId)) {
        console.log('❌ [VALIDATION]', requestId, '- Invalid event ID:', eventId);
        return res.status(400).json({
          success: false,
          message: 'Valid event ID is required',
          requestId: requestId
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      console.log('🎯 [REQUEST]', requestId, '- Fetching ticket groups for event:', eventId);
      
      const result = await ticketEvolutionService.getEventTicketGroups(
        parseInt(eventId),
        pageNum,
        limitNum
      );

      const processingTime = Date.now() - startTime;
      console.log('✅ [RESPONSE]', requestId, '- Event ticket groups fetched successfully');
      console.log('   Ticket groups returned:', result.ticketGroups?.length || 0);
      console.log('   Processing time:', processingTime + 'ms');

      res.json({
        success: true,
        data: result,
        requestId: requestId
      });

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ [ERROR]', requestId, '- Error in getEventTicketGroups controller');
      console.error('   Event ID:', req.params.eventId);
      console.error('   Error message:', error.message);
      console.error('   Processing time before error:', totalTime + 'ms');

      // Handle specific error cases
      if (error.message.includes('not found') || error.message.includes('404')) {
        console.log('📭 [INFO]', requestId, '- No ticket groups found for this event');
        return res.status(404).json({
          success: false,
          message: 'No ticket groups available for this event',
          requestId: requestId
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event ticket groups',
        error: error.message,
        requestId: requestId
      });
    }
  }

  // Get seatmap data for event (venue and configuration)
  async getEventSeatmap(req, res) {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();

    console.log('🗺️ [REQUEST]', requestId, '- Event seatmap data API called');
    console.log('   Event ID from params:', req.params.eventId);

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

      console.log('🗺️ [REQUEST]', requestId, '- Fetching seatmap data for event:', eventId);
      
      const result = await ticketEvolutionService.getEventSeatmapData(parseInt(eventId));

      const processingTime = Date.now() - startTime;
      console.log('✅ [RESPONSE]', requestId, '- Event seatmap data fetched successfully');
      console.log('   Venue ID:', result.venueId);
      console.log('   Configuration ID:', result.configurationId);
      console.log('   Processing time:', processingTime + 'ms');

      res.json({
        success: true,
        data: result,
        requestId: requestId
      });

    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error('❌ [ERROR]', requestId, '- Error in getEventSeatmap controller');
      console.error('   Event ID:', req.params.eventId);
      console.error('   Error message:', error.message);
      console.error('   Processing time before error:', totalTime + 'ms');

      if (error.message.includes('not found') || error.message.includes('404')) {
        return res.status(404).json({
          success: false,
          message: 'Event or seatmap data not found',
          requestId: requestId
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event seatmap data',
        error: error.message,
        requestId: requestId
      });
    }
  }

  // Get ticket details by ID
  async getTicket(req, res) {
    try {
      const { ticketId } = req.params;

      if (!ticketId || isNaN(ticketId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid ticket ID is required',
        });
      }

      // Note: This endpoint might not be available in all TicketEvolution API plans
      // You may need to implement this differently based on your API access level
      const ticket = await ticketEvolutionService.getTicket(parseInt(ticketId));

      res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      console.error(`Error in getTicket for ID ${req.params.ticketId}:`, error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch ticket details',
        error: error.message,
      });
    }
  }
}

module.exports = new TicketsController();

