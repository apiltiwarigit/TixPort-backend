const express = require('express');
const router = express.Router();
const eventsController = require('../controllers/eventsController');

// GET /api/events - Get all events with optional filtering
router.get('/', eventsController.getEvents);

module.exports = router;

