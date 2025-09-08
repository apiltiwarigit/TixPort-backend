const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireAdmin, requireOwner, getUserRole } = require('../middleware/adminMiddleware');

// Apply auth middleware to all admin routes
router.use(authMiddleware.authenticateToken);

// ===========================
// DASHBOARD ROUTES
// ===========================

// Get dashboard statistics (admin/owner only)
router.get('/dashboard/stats', requireAdmin, adminController.getDashboardStats);

// ===========================
// USER MANAGEMENT ROUTES
// ===========================

// Get all users (admin/owner only)
router.get('/users', requireAdmin, adminController.getUsers);

// Update user role (owner only)
router.patch('/users/:userId/role', requireOwner, adminController.updateUserRole);

// ===========================
// HERO SECTION ROUTES
// ===========================

// Get all hero sections (admin/owner only)
router.get('/hero-sections', requireAdmin, adminController.getHeroSections);

// Create hero section (admin/owner only)
router.post('/hero-sections', requireAdmin, adminController.createHeroSection);

// Update hero section (admin/owner only)
router.patch('/hero-sections/:id', requireAdmin, adminController.updateHeroSection);

// Delete hero section (admin/owner only)
router.delete('/hero-sections/:id', requireAdmin, adminController.deleteHeroSection);

// ===========================
// CATEGORY MANAGEMENT ROUTES
// ===========================

// Sync categories from TicketEvolution API (admin/owner only)
router.post('/categories/sync', requireAdmin, adminController.syncCategories);

// Get all categories for admin management (admin/owner only)
router.get('/categories', requireAdmin, adminController.getCategories);

// Update category visibility (admin/owner only)
router.patch('/categories/:id/visibility', requireAdmin, adminController.updateCategoryVisibility);

// Update category processed data (admin/owner only)
router.patch('/categories/:id/processed-data', requireAdmin, adminController.updateCategoryProcessedData);

// Update category settings (admin/owner only)
router.patch('/categories/:id/settings', requireAdmin, adminController.updateCategorySettings);

// Toggle category featured flag (compat)
router.patch('/categories/:id/featured', requireAdmin, adminController.updateCategoryFeatured);

// Get category analytics (admin/owner only)
router.get('/categories/analytics', requireAdmin, adminController.getCategoryAnalytics);

// ===========================
// HOMEPAGE CATEGORIES ROUTES
// ===========================

// Get homepage categories (admin/owner only)
router.get('/homepage-categories', requireAdmin, adminController.getHomepageCategories);

// Set homepage categories (admin/owner only)
router.post('/homepage-categories', requireAdmin, adminController.setHomepageCategories);

// ===========================
// PROJECT CONFIG ROUTES
// ===========================

// Get all config settings (admin/owner only)
router.get('/config', requireAdmin, adminController.getConfig);

// Update config setting (admin/owner only)
router.post('/config', requireAdmin, adminController.updateConfig);

// Delete config setting (owner only)
router.delete('/config/:config_key', requireOwner, adminController.deleteConfig);

module.exports = router;
