const ticketEvolutionService = require('../services/ticketEvolutionService');
const config = require('../config/config');

class CheckoutController {
  // Get Stripe publishable key for frontend
  async getStripeConfig(req, res) {
    try {
      const publishableKey = config.ticketEvolution.stripePublishableKey;
      if (!publishableKey) {
        return res.status(500).json({
          success: false,
          message: 'Stripe publishable key is not configured.'
        });
      }

      res.json({
        publishableKey: config.ticketEvolution.stripePublishableKey,
        environment: config.ticketEvolution.environment
      });
    } catch (error) {
      console.error('❌ getStripeConfig error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get Stripe configuration',
        error: error.message
      });
    }
  }

  // Get delivery options and tax quote
  async getOrderCalculation(req, res) {
    try {
      const { eventId, zipCode, ticketGroupId, quantity } = req.body;

      if (!eventId || !ticketGroupId || !quantity) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: eventId, ticketGroupId, quantity'
        });
      }

      console.log('📊 Calculating order for:', { eventId, zipCode, ticketGroupId, quantity });

      const results = {};

      // Get shipping suggestions if zip code provided
      if (zipCode) {
        try {
          results.shippingOptions = await ticketEvolutionService.getShippingSuggestions(eventId, zipCode);
        } catch (error) {
          console.warn('⚠️ Could not get shipping suggestions:', error.message);
          results.shippingOptions = [];
        }
      }

      // Get basic delivery options (fallback)
      if (!results.shippingOptions || results.shippingOptions.length === 0) {
        results.shippingOptions = [
          { type: 'Eticket', cost: 0, description: 'Electronic delivery' },
          { type: 'TMMobile', cost: 0, description: 'Mobile tickets' },
          { type: 'FedEx', cost: 25, description: 'FedEx overnight delivery' }
        ];
      }

      // Create tax quote if we have location info
      if (zipCode) {
        try {
          const taxQuoteData = {
            order_amount: req.body.orderAmount || 0,
            zip_code: zipCode,
            ticket_group_id: ticketGroupId,
            quantity: quantity
          };
          
          results.taxQuote = await ticketEvolutionService.createTaxQuote(taxQuoteData);
        } catch (error) {
          console.warn('⚠️ Could not create tax quote:', error.message);
          results.taxQuote = { tax_amount: 0, signature: null };
        }
      } else {
        results.taxQuote = { tax_amount: 0, signature: null };
      }

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      console.error('❌ getOrderCalculation error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate order details',
        error: error.message
      });
    }
  }

  // Process checkout and create TEvo order
  async processCheckout(req, res) {
    try {
      const {
        stripeToken,
        sessionId,
        ticketGroup,
        cartItems,
        buyer,
        delivery,
        orderAmount,
        taxSignature,
        isCartCheckout
      } = req.body;

      // Validate required fields for different checkout types
      if (!stripeToken || !buyer || !delivery) {
        return res.status(400).json({
          success: false,
          message: 'Missing required checkout data'
        });
      }

      // Validate items based on checkout type
      if (isCartCheckout) {
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Cart checkout requires cart items'
          });
        }
      } else {
        if (!ticketGroup) {
          return res.status(400).json({
            success: false,
            message: 'Direct checkout requires ticket group'
          });
        }
      }

      if (isCartCheckout) {
        console.log('🛒 Processing cart checkout:', {
          cartItems: cartItems.length,
          totalAmount: orderAmount,
          buyer: buyer.email,
          delivery: delivery.type
        });

        // Pre-validate all cart items before attempting any order creation
        try {
          const validations = await Promise.all(
            cartItems.map(async (item, index) => {
              try {
                const tg = await ticketEvolutionService.getTicketGroup(item.ticketGroupId);
                const issues = [];
                if (tg.state && tg.state !== 'available') {
                  issues.push('unavailable');
                }
                if (typeof item.quantity === 'number' && typeof tg.quantity === 'number' && item.quantity > tg.quantity) {
                  issues.push('insufficient_quantity');
                }
                return {
                  index,
                  ticketGroupId: item.ticketGroupId,
                  ok: issues.length === 0,
                  issues,
                  current: {
                    price: tg.price ?? tg.retail_price,
                    quantity: tg.quantity,
                    state: tg.state
                  }
                };
              } catch (e) {
                return {
                  index,
                  ticketGroupId: item.ticketGroupId,
                  ok: false,
                  issues: ['not_found'],
                  current: null
                };
              }
            })
          );

          const failedValidations = validations.filter(v => !v.ok);
          if (failedValidations.length > 0) {
            return res.status(409).json({
              success: false,
              message: 'Some cart items are unavailable or changed. Please review your cart.',
              data: { failed: failedValidations }
            });
          }
        } catch (validationError) {
          console.error('❌ Cart pre-validation error:', validationError.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to validate cart items. Please try again.',
            error: process.env.NODE_ENV === 'development' ? validationError.message : undefined
          });
        }
      } else {
        console.log('🛒 Processing direct checkout:', {
          ticketGroupId: ticketGroup.id,
          quantity: ticketGroup.quantity,
          price: ticketGroup.price,
          buyer: buyer.email,
          delivery: delivery.type
        });
      }

      // Step 1: Create or get TEvo client for the buyer
      let clientId;
      try {
        const clientData = {
          first_name: buyer.firstName || 'Customer',
          last_name: buyer.lastName || 'Customer',
          email_address: buyer.email,
          phone_number: buyer.phone
        };

        const client = await ticketEvolutionService.createClient(clientData);
        clientId = client.id;
        console.log('✅ Client created/found:', clientId);
      } catch (clientError) {
        console.warn('⚠️ Client creation failed, using inline attributes');
        clientId = null; // Will use inline attributes instead
      }

      // Step 2: Prepare order data for TEvo
      const orderData = {
        order: {
          created_by_ip_address: req.ip || req.connection.remoteAddress || '127.0.0.1',
          session_id: sessionId || `session_${Date.now()}`, // For Riskified
          delivery: {
            type: delivery.type || 'Eticket',
            cost: delivery.cost || 0,
            email_address_attributes: { address: buyer.email },
            phone_number_attributes: { number: buyer.phone || '+1-555-555-5555' }
          },
          payments: [{
            type: 'credit_card',
            token: stripeToken // Stripe token from Elements
          }]
        }
      };

      // Add ticket groups based on checkout type
      if (isCartCheckout) {
        // For cart checkout, create multiple orders or combine into one order with multiple ticket groups
        // TEvo API typically handles one ticket group per order, so we'll process the first item
        // and return a mock response for demonstration
        const primaryItem = cartItems[0];
        orderData.order.ticket_group = {
          id: primaryItem.ticketGroupId,
          price: primaryItem.price,
          quantity: primaryItem.quantity
        };
        
        // Note: For multiple items, you'd typically create separate orders
        // or check if TEvo API supports multiple ticket groups in one order
      } else {
        orderData.order.ticket_group = {
          id: ticketGroup.id,
          price: ticketGroup.price,
          quantity: ticketGroup.quantity
        };
      }

      // Add client_id if we created one, otherwise use inline attributes
      if (clientId) {
        orderData.order.client_id = clientId;
      } else {
        // Use inline client attributes
        orderData.order.client_attributes = {
          first_name: buyer.firstName || 'Customer',
          last_name: buyer.lastName || 'Customer',
          email_address_attributes: { address: buyer.email },
          phone_number_attributes: { number: buyer.phone || '+1-555-555-5555' }
        };
      }

      // Add tax signature if provided
      if (taxSignature) {
        orderData.order.tax_signature = taxSignature;
      }

      // Add delivery address if provided
      if (delivery.address) {
        orderData.order.delivery.address_attributes = delivery.address;
      }

      console.log('📋 Final order data:', JSON.stringify(orderData, null, 2));

      // Step 3: Create the order(s) with TEvo
      if (isCartCheckout && Array.isArray(cartItems) && cartItems.length > 1) {
        // Process multiple items sequentially; collect successes and failures
        const successes = [];
        const failures = [];

        for (let i = 0; i < cartItems.length; i++) {
          const item = cartItems[i];
          const itemOrderData = JSON.parse(JSON.stringify(orderData));
          itemOrderData.order.ticket_group = {
            id: item.ticketGroupId,
            price: item.price,
            quantity: item.quantity
          };

          try {
            const itemResponse = await ticketEvolutionService.createOrder(itemOrderData);
            successes.push({
              index: i,
              ticketGroupId: item.ticketGroupId,
              orderId: itemResponse.order?.id,
              status: itemResponse.order?.state,
              total: itemResponse.order?.total_amount
            });
          } catch (itemError) {
            console.error(`❌ Failed to create order for item ${i}:`, itemError.message);
            failures.push({
              index: i,
              ticketGroupId: item.ticketGroupId,
              message: itemError.message
            });
          }
        }

        const grandTotal = successes.reduce((sum, r) => sum + (r.total || 0), 0);

        const partial = failures.length > 0 && successes.length > 0;
        const noneSucceeded = successes.length === 0;

        return res.status(200).json({
          success: !noneSucceeded,
          message: partial
            ? 'Some orders failed to create. See details.'
            : noneSucceeded
              ? 'No orders were created.'
              : 'Orders created successfully',
          data: {
            multiOrder: true,
            partialSuccess: partial,
            successes,
            failures,
            total: grandTotal || orderAmount
          }
        });
      } else {
        const orderResponse = await ticketEvolutionService.createOrder(orderData);

        // Step 4: Return success response
        return res.json({
          success: true,
          message: 'Order created successfully',
          data: {
            orderId: orderResponse.order?.id,
            orderUrl: orderResponse.order?.url,
            status: orderResponse.order?.state,
            confirmation: orderResponse.order?.id,
            delivery: orderResponse.order?.delivery,
            total: orderResponse.order?.total_amount || orderAmount
          }
        });
      }

    } catch (error) {
      console.error('❌ processCheckout error:', error.message);
      
      // Handle specific TEvo API errors
      let errorMessage = 'Checkout failed. Please try again.';
      if (error.message.includes('Invalid API token')) {
        errorMessage = 'Payment processing unavailable. Please contact support.';
      } else if (error.message.includes('Rate limit')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (error.message.includes('not found')) {
        errorMessage = 'The selected tickets are no longer available.';
      }

      res.status(500).json({
        success: false,
        message: errorMessage,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Get order status by ID
  async getOrderStatus(req, res) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required'
        });
      }

      // Note: This would require implementing order lookup in TEvo service
      // For now, return a placeholder response
      res.json({
        success: true,
        data: {
          orderId,
          status: 'processing',
          message: 'Order status lookup not implemented yet'
        }
      });

    } catch (error) {
      console.error('❌ getOrderStatus error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to get order status',
        error: error.message
      });
    }
  }
}

module.exports = new CheckoutController();
