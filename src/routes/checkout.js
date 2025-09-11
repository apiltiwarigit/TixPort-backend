const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');
const { authenticateToken } = require('../middleware/authMiddleware');

/**
 * Checkout Routes
 * 
 * Implements the complete Ticket Evolution Affiliate + Stripe checkout workflow
 * Following the official integration guide
 */

// ===========================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// ===========================

// GET /api/checkout/stripe-config - Get Stripe publishable key for frontend
router.get('/stripe-config', checkoutController.getStripeConfig.bind(checkoutController));

// POST /api/checkout/calculate - Calculate order details (delivery + tax)
router.post('/calculate', checkoutController.calculateOrderDetails.bind(checkoutController));

// ===========================
// AUTHENTICATED ROUTES
// ===========================

// POST /api/checkout/client - Create TEvo client
router.post('/client', authenticateToken, checkoutController.createClient.bind(checkoutController));

// POST /api/checkout/delivery-pricing - Get delivery pricing suggestions
router.post('/delivery-pricing', authenticateToken, checkoutController.getDeliveryPricing.bind(checkoutController));

// POST /api/checkout/tax-quote - Get tax quote for order
router.post('/tax-quote', authenticateToken, checkoutController.getTaxQuote.bind(checkoutController));

// POST /api/checkout/process - Process the complete checkout
router.post('/process', authenticateToken, checkoutController.processCheckout.bind(checkoutController));

// GET /api/checkout/order/:orderId - Get order status
router.get('/order/:orderId', authenticateToken, checkoutController.getOrderStatus.bind(checkoutController));

module.exports = router;
