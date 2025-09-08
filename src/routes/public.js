const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// ===========================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// ===========================

// Get active hero sections for public display
router.get('/hero-sections', adminController.getActiveHeroSections);

// Get homepage categories for public display (active only)
router.get('/homepage-categories', adminController.getPublicHomepageCategories);

// Get public config settings
router.get('/config', adminController.getPublicConfig);

module.exports = router;
