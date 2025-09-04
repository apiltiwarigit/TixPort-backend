const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');

// GET /api/events - Get all events with optional filtering
router.get('/', eventsController.getEvents);

// GET /api/events/:eventId - Get single event by ID
router.get('/:eventId', eventsController.getSingleEvent);

// POST /api/events/clear-cache - Clear cache for debugging
router.post('/clear-cache', eventsController.clearCache);

module.exports = router;

