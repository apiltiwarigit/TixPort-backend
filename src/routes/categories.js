const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categoriesController');

// GET /api/categories - Get all categories
router.get('/', categoriesController.getCategories);

// GET /api/categories/popular - Get popular categories
router.get('/popular', categoriesController.getPopularCategories);

// GET /api/categories/:id/events - Get events for a specific category
router.get('/:id/events', categoriesController.getCategoryEvents);

module.exports = router;

