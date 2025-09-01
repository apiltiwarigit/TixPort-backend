const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');

// GET /api/events - Get all events with optional filtering
router.get('/', eventsController.getEvents);

// GET /api/events/search - Search events
router.get('/search', eventsController.searchEvents);

// GET /api/events/category/:categoryId - Get events by category
router.get('/category/:categoryId', eventsController.getEventsByCategory);

// GET /api/events/performer/:performerId - Get events by performer
router.get('/performer/:performerId', eventsController.getEventsByPerformer);

// GET /api/events/venue/:venueId - Get events by venue
router.get('/venue/:venueId', eventsController.getEventsByVenue);

// GET /api/events/location - Get events by location
router.get('/location', eventsController.getEventsByLocation);

// GET /api/events/:eventId - Get single event by ID
router.get('/:eventId', eventsController.getEvent);

module.exports = router;
