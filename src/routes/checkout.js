const express = require('express');
const { body, validationResult } = require('express-validator');
const checkoutController = require('../controllers/checkoutController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Validation middleware for checkout (supports cart and direct checkout)
const validateCheckout = [
  body('isCartCheckout').optional().isBoolean().withMessage('isCartCheckout must be a boolean'),
  body('stripeToken').notEmpty().withMessage('Stripe token is required'),
  body('buyer.email').isEmail().withMessage('Valid email is required'),
  body('buyer.phone').optional().isMobilePhone().withMessage('Valid phone number required'),
  body('delivery.type').isIn(['Eticket', 'TMMobile', 'FedEx', 'UPS']).withMessage('Valid delivery type required'),

  // Direct checkout validations when not cart checkout
  body('ticketGroup.id')
    .if((value, { req }) => !req.body.isCartCheckout)
    .isInt()
    .withMessage('Valid ticket group ID is required'),
  body('ticketGroup.quantity')
    .if((value, { req }) => !req.body.isCartCheckout)
    .isInt({ min: 1, max: 10 })
    .withMessage('Quantity must be between 1 and 10'),
  body('ticketGroup.price')
    .if((value, { req }) => !req.body.isCartCheckout)
    .isFloat({ min: 0 })
    .withMessage('Valid ticket price is required'),

  // Cart checkout validations
  body('cartItems')
    .if((value, { req }) => req.body.isCartCheckout)
    .isArray({ min: 1 })
    .withMessage('cartItems must be a non-empty array'),
  body('cartItems.*.ticketGroupId')
    .if((value, { req }) => req.body.isCartCheckout)
    .isInt()
    .withMessage('cartItems.*.ticketGroupId must be an integer'),
  body('cartItems.*.quantity')
    .if((value, { req }) => req.body.isCartCheckout)
    .isInt({ min: 1, max: 10 })
    .withMessage('cartItems.*.quantity must be between 1 and 10'),
  body('cartItems.*.price')
    .if((value, { req }) => req.body.isCartCheckout)
    .isFloat({ min: 0 })
    .withMessage('cartItems.*.price must be a positive number'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateOrderCalculation = [
  body('eventId').isInt().withMessage('Valid event ID is required'),
  body('ticketGroupId').isInt().withMessage('Valid ticket group ID is required'),
  body('quantity').isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10'),
  body('zipCode').optional().isPostalCode('US').withMessage('Valid US zip code required'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

/**
 * @route   GET /api/checkout/stripe-config
 * @desc    Get Stripe configuration for frontend
 * @access  Public
 */
router.get('/stripe-config', checkoutController.getStripeConfig);

/**
 * @route   POST /api/checkout/calculate
 * @desc    Calculate order totals, taxes, and delivery options
 * @access  Public
 */
router.post('/calculate', validateOrderCalculation, checkoutController.getOrderCalculation);

/**
 * @route   POST /api/checkout/process
 * @desc    Process checkout and create TEvo order
 * @access  Private (requires authentication)
 */
router.post('/process', authMiddleware.authenticateToken, validateCheckout, checkoutController.processCheckout);

/**
 * @route   GET /api/checkout/orders/:orderId/status
 * @desc    Get order status by ID
 * @access  Private (requires authentication)
 */
router.get('/orders/:orderId/status', authMiddleware.authenticateToken, checkoutController.getOrderStatus);

module.exports = router;
