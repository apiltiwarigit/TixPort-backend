const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// ===========================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// ===========================

// Get active hero sections for public display
router.get('/hero-sections', adminController.getActiveHeroSections);

// Get homepage categories for public display
router.get('/homepage-categories', adminController.getHomepageCategories);

// Get public config settings
router.get('/config', adminController.getPublicConfig);

module.exports = router;
