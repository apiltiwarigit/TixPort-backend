const express = require('express');
const router = express.Router();
const categoriesController = require('../controllers/categoriesController');

// GET /api/categories - Get all categories
router.get('/', categoriesController.getCategories);

// GET /api/categories/popular - Get popular categories
router.get('/popular', categoriesController.getPopularCategories);
module.exports = router;