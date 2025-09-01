const express = require('express');
const router = express.Router();
const ticketsController = require('../controllers/ticketsController');

// GET /api/tickets/event/:eventId - Get tickets for a specific event
router.get('/event/:eventId', ticketsController.getEventTickets);

// GET /api/tickets/:ticketId - Get ticket details by ID
router.get('/:ticketId', ticketsController.getTicket);

module.exports = router;
