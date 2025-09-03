const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, requireAdmin, authRateLimit } = require('../middleware/authMiddleware');

// Public routes (no authentication required)
router.post('/signin', authRateLimit, authController.signIn);
router.post('/signup', authRateLimit, authController.signUp);
router.post('/signout', authController.signOut);
router.post('/verify', authRateLimit, authController.verifyAuth);
router.post('/refresh', authRateLimit, authController.refreshSession);
router.post('/initialize-tables', authController.initializeTables); // For development/setup

// Protected routes (authentication required)
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, authController.updateProfile);
router.delete('/account', authenticateToken, authController.deleteAccount);

// Admin routes
router.get('/users', authenticateToken, requireAdmin, authController.listUsers);

module.exports = router;
