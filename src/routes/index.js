const express = require('express');
const router = express.Router();

// Import route modules
const eventsRoutes = require('./events');
const ticketsRoutes = require('./tickets');
const categoriesRoutes = require('./categories');
const authRoutes = require('./auth');
const checkoutRoutes = require('./checkout');
const adminRoutes = require('./admin');
const publicRoutes = require('./public');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'TixPort API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API routes
router.use('/events', eventsRoutes);
router.use('/tickets', ticketsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/auth', authRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/admin', adminRoutes);
router.use('/public', publicRoutes);

// 404 handler for unknown API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.originalUrl,
  });
});

module.exports = router;

