const ticketEvolutionService = require('../services/ticketEvolutionService');

class TicketsController {
  // Get tickets for a specific event
  async getEventTickets(req, res) {
    try {
      const { eventId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (!eventId || isNaN(eventId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid event ID is required',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const result = await ticketEvolutionService.getEventTickets(
        parseInt(eventId),
        pageNum,
        limitNum
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error(`Error in getEventTickets for event ${req.params.eventId}:`, error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'Event not found or no tickets available',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to fetch event tickets',
        error: error.message,
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
