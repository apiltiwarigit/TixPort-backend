const axios = require('axios');
const config = require('../config/config');
const tevoSignature = require('../services/tevoSignatureService');

/**
 * Checkout Controller
 * 
 * Handles the complete checkout workflow following the Ticket Evolution Affiliate + Stripe integration
 * Reference: https://ticketevolution.atlassian.net/wiki/spaces/API/pages/3510599681
 */
class CheckoutController {
    constructor() {
        this.validateConfig();
    }

    validateConfig() {
        const sigValidation = tevoSignature.validateConfig();
        if (!sigValidation.isValid) {
            throw new Error(`Checkout configuration invalid: ${sigValidation.errors.join(', ')}`);
        }
    }

    /**
     * Get Stripe configuration for frontend
     * GET /api/checkout/stripe-config
     */
    async getStripeConfig(req, res) {
        try {
            res.json({
                success: true,
                publishableKey: config.stripe.publishableKey,
                environment: config.ticketEvolution.environment
            });
        } catch (error) {
            console.error('❌ Error getting Stripe config:', error.message);
            res.status(500).json({
                success: false,
                message: 'Failed to get payment configuration',
                error: error.message
            });
        }
    }

    /**
     * Create or reuse a Client in TEvo
     * POST /api/checkout/client
     */
    async createClient(req, res) {
        try {
            const { name, email, phone, address } = req.body;

            // Validate required fields
            if (!name || !email || !phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Name, email, and phone are required'
                });
            }

            // Prepare client data for TEvo
            const clientData = {
                clients: [
                    {
                        name: name.trim(),
                        email_addresses: [
                            {
                                label: 'home',
                                address: email.trim(),
                                is_primary: true
                            }
                        ],
                        phone_numbers: [
                            {
                                label: 'cell',
                                country_code: '+1',
                                number: phone.replace(/\D/g, ''), // Remove non-digits
                                is_primary: true
                            }
                        ],
                        ...(address && {
                            addresses: [{
                                label: 'billing',
                                street_address: address.line1 || '',
                                extended_address: address.line2 || '',
                                locality: address.city || '',
                                region: address.state || '',
                                postal_code: address.postal_code || '',
                                country_code: address.country_code || 'US',
                                is_primary_billing: true
                            }]
                        })
                    }
                ]
            };

            // Make signed request to TEvo
            const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
            const path = '/v9/clients';

            const headers = tevoSignature.getSignedHeaders({
                method: 'POST',
                host,
                path,
                body: clientData
            });

            const response = await axios.post(
                `${config.ticketEvolution.apiUrl}/clients`,
                clientData,
                {
                    headers,
                    timeout: config.ticketEvolution.timeout
                }
            );

            const client = response.data.clients?.[0] || response.data.client;

            if (!client || !client.id) {
                throw new Error('Invalid client response from TEvo API');
            }

            console.log(`✅ Created TEvo client: ${client.id} for ${email}`);

            res.json({
                success: true,
                data: {
                    clientId: client.id,
                    emailAddressId: client.email_addresses?.[0]?.id,
                    phoneNumberId: client.phone_numbers?.[0]?.id,
                    addressId: client.addresses?.[0]?.id
                }
            });

        } catch (error) {
            console.error('❌ Error creating client:', error.message);

            if (error.response?.status === 422) {
                // Client might already exist - try to extract useful error info
                const errorData = error.response.data;
                res.status(400).json({
                    success: false,
                    message: 'Client validation failed',
                    details: errorData?.message || errorData?.error,
                    error: error.message
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create client',
                    error: error.message
                });
            }
        }
    }

    /**
     * Get delivery pricing suggestion
     * POST /api/checkout/delivery-pricing
     */
    async getDeliveryPricing(req, res) {
        try {
            const { ticketGroupId, address } = req.body;

            if (!ticketGroupId) {
                return res.status(400).json({
                    success: false,
                    message: 'Ticket group ID is required'
                });
            }

            // First get the ticket group to determine format
            const ticketGroup = await this._getTicketGroup(ticketGroupId);

            if (!ticketGroup) {
                return res.status(404).json({
                    success: false,
                    message: 'Ticket group not found'
                });
            }

            const format = ticketGroup.format;
            let deliveryOptions = [];

            // Handle different ticket formats
            if (format === 'Eticket') {
                deliveryOptions = [{
                    type: 'Eticket',
                    cost: 0,
                    description: 'Electronic Delivery - Instant'
                }];
            } else if (format === 'TM_mobile' || format === 'TMMobile') {
                deliveryOptions = [{
                    type: 'TMMobile',
                    cost: 0,
                    description: 'Mobile Transfer - Instant'
                }];
            } else {
                // Physical tickets - get shipping suggestion from TEvo
                if (address) {
                    try {
                        const shippingData = {
                            ticket_group_id: ticketGroupId,
                            address_attributes: {
                                street_address: address.line1 || '',
                                extended_address: address.line2 || '',
                                locality: address.city || '',
                                region: address.state || '',
                                postal_code: address.postal_code || '',
                                country_code: address.country_code || 'US'
                            }
                        };

                        const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
                        const path = '/v9/shipments/suggestion';

                        const headers = tevoSignature.getSignedHeaders({
                            method: 'POST',
                            host,
                            path,
                            body: shippingData
                        });

                        const response = await axios.post(
                            `${config.ticketEvolution.apiUrl}/shipments/suggestion`,
                            shippingData,
                            {
                                headers,
                                timeout: config.ticketEvolution.timeout
                            }
                        );

                        const suggestion = response.data;
                        deliveryOptions = [{
                            type: 'FedEx',
                            cost: suggestion.cost || 15.00, // Fallback cost
                            description: `FedEx ${suggestion.service || 'Standard'} Shipping`
                        }];

                    } catch (shippingError) {
                        console.warn('⚠️ Shipping suggestion failed, using defaults:', shippingError.message);
                        deliveryOptions = [{
                            type: 'FedEx',
                            cost: 15.00,
                            description: 'FedEx Standard Shipping'
                        }];
                    }
                } else {
                    // No address provided, return default shipping options
                    deliveryOptions = [
                        {
                            type: 'FedEx',
                            cost: 15.00,
                            description: 'FedEx Standard Shipping'
                        },
                        {
                            type: 'LocalPickup',
                            cost: 0,
                            description: 'Local Pickup (if available)'
                        }
                    ];
                }
            }

            res.json({
                success: true,
                data: {
                    ticketGroupId,
                    format,
                    shippingOptions: deliveryOptions
                }
            });

        } catch (error) {
            console.error('❌ Error getting delivery pricing:', error.message);
            res.status(500).json({
                success: false,
                message: 'Failed to get delivery pricing',
                error: error.message
            });
        }
    }

    /**
     * Get tax quote for order
     * POST /api/checkout/tax-quote
     */
    async getTaxQuote(req, res) {
        try {
            const { ticketGroupId, quantity, retailPrice, shipping = 0, serviceFee = 0 } = req.body;

            if (!ticketGroupId || !quantity || !retailPrice) {
                return res.status(400).json({
                    success: false,
                    message: 'Ticket group ID, quantity, and retail price are required'
                });
            }

            const taxData = {
                ticket_group_id: ticketGroupId,
                quantity: parseInt(quantity),
                retail: {
                    price: parseFloat(retailPrice),
                    shipping: parseFloat(shipping),
                    service_fee: parseFloat(serviceFee)
                }
            };

            const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
            const path = '/v9/tax_quotes';

            const headers = tevoSignature.getSignedHeaders({
                method: 'POST',
                host,
                path,
                body: taxData
            });

            const response = await axios.post(
                `${config.ticketEvolution.apiUrl}/tax_quotes`,
                taxData,
                {
                    headers,
                    timeout: config.ticketEvolution.timeout
                }
            );

            const taxQuote = response.data;

            res.json({
                success: true,
                data: {
                    taxAmount: taxQuote.retail?.tax || 0,
                    signature: taxQuote.tax_signature,
                    breakdown: taxQuote.retail
                }
            });

        } catch (error) {
            console.error('❌ Error getting tax quote:', error.message);

            // Tax quotes are optional, so don't fail the entire checkout
            res.json({
                success: true,
                data: {
                    taxAmount: 0,
                    signature: null,
                    breakdown: null
                }
            });
        }
    }

    /**
     * Calculate order details (combines delivery pricing and tax quote)
     * POST /api/checkout/calculate
     */
    async calculateOrderDetails(req, res) {
        try {
            const { eventId, ticketGroupId, quantity, zipCode, orderAmount } = req.body;

            if (!ticketGroupId || !quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'Ticket group ID and quantity are required'
                });
            }

            // Get delivery pricing directly
            const deliveryResult = await this._getDeliveryPricingInternal(ticketGroupId);

            // Get tax quote if we have an address/zip
            let taxQuote = null;
            if (orderAmount && zipCode) {
                try {
                    taxQuote = await this._getTaxQuoteInternal({
                        ticketGroupId,
                        quantity,
                        retailPrice: orderAmount / quantity,
                        shipping: 0,
                        serviceFee: 0
                    });
                } catch (taxError) {
                    console.warn('⚠️ Tax quote failed, proceeding without:', taxError.message);
                }
            }

            res.json({
                success: true,
                data: {
                    shippingOptions: deliveryResult.shippingOptions,
                    taxQuote: taxQuote ? {
                        tax_amount: taxQuote.taxAmount,
                        signature: taxQuote.signature
                    } : null
                }
            });

        } catch (error) {
            console.error('❌ Error calculating order details:', error.message);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate order details',
                error: error.message
            });
        }
    }

    /**
     * Process the complete checkout
     * POST /api/checkout/process
     */
    async processCheckout(req, res) {
        try {
            const {
                stripeToken,
                sessionId,
                ticketGroup,
                cartItems, // For cart checkout
                buyer,
                delivery,
                orderAmount,
                taxSignature,
                isCartCheckout = false
            } = req.body;

            // Validate required fields
            if (!stripeToken || !buyer || !delivery) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required checkout information'
                });
            }

            // Get client IP for fraud protection
            const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];

            // Create client first
            const clientResult = await this._createClientInternal({
                name: `${buyer.firstName} ${buyer.lastName}`,
                email: buyer.email,
                phone: buyer.phone,
                address: delivery.address
            });

            const clientId = clientResult.clientId;

            // Handle single item vs cart checkout
            let orderData;
            if (isCartCheckout && cartItems) {
                // For now, process the first item (full cart support would require multiple orders)
                const primaryItem = cartItems[0];
                orderData = {
                    ticket_group: {
                        id: primaryItem.ticketGroupId,
                        quantity: primaryItem.quantity,
                        price: primaryItem.price
                    }
                };
            } else if (ticketGroup) {
                orderData = {
                    ticket_group: {
                        id: ticketGroup.id,
                        quantity: ticketGroup.quantity,
                        price: ticketGroup.price
                    }
                };
            } else {
                throw new Error('No ticket information provided');
            }

            // Prepare order payload for TEvo v10 API
            const orderPayload = {
                order: {
                    client_id: clientId,
                    created_by_ip_address: clientIP || '127.0.0.1',
                    session_id: sessionId,
                    delivery: {
                        type: delivery.type,
                        cost: delivery.cost || 0,
                        email_address_attributes: { address: buyer.email },
                        phone_number_attributes: { number: buyer.phone.replace(/\D/g, '') },
                        ...(delivery.address && {
                            address_attributes: {
                                street_address: delivery.address.line1 || '',
                                extended_address: delivery.address.line2 || '',
                                locality: delivery.address.city || '',
                                region: delivery.address.state || '',
                                postal_code: delivery.address.postal_code || '',
                                country_code: delivery.address.country_code || 'US',
                                label: 'shipping',
                                is_primary: true
                            }
                        })
                    },
                    ticket_group: orderData.ticket_group,
                    payments: [
                        {
                            type: 'credit_card',
                            token: stripeToken,
                            address_attributes: {
                                street_address: delivery.address?.line1 || '',
                                extended_address: delivery.address?.line2 || '',
                                locality: delivery.address?.city || '',
                                region: delivery.address?.state || '',
                                postal_code: delivery.address?.postal_code || '',
                                country_code: delivery.address?.country_code || 'US',
                                label: 'billing',
                                is_primary: true
                            }
                        }
                    ],
                    service_fee: 0,
                    shipping: delivery.cost || 0,
                    discount: 0,
                    ...(taxSignature && {
                        tax_signature: taxSignature
                    })
                }
            };

            // Make signed request to TEvo v10 Orders API
            const host = tevoSignature.extractHost(config.ticketEvolution.v10ApiUrl);
            const path = '/v10/orders';

            const headers = tevoSignature.getSignedHeaders({
                method: 'POST',
                host,
                path,
                body: orderPayload,
                apiVersion: 'v10'
            });

            console.log(`🛒 Placing order for client ${clientId}:`, {
                ticketGroup: orderData.ticket_group,
                delivery: delivery.type,
                amount: orderAmount
            });

            console.log('payload: ', orderPayload);
            console.log('headers: ', headers);

            const response = await axios.post(
                `${config.ticketEvolution.v10ApiUrl}/orders`,
                orderPayload,
                {
                    headers,
                    timeout: config.ticketEvolution.timeout
                }
            );

      const order = response.data;

      console.log(`✅ Order placed successfully: ${order.oid || order.id}`);

      // Update real statistics (async, don't wait)
      try {
        const adminController = require('./adminController');
        
        // Increment tickets sold
        adminController.incrementRealStats('tickets_sold', orderData.ticket_group.quantity);
        
        // Calculate money saved (simple estimate: 10% of order amount)
        if (orderAmount && orderAmount > 0) {
          const estimatedSavings = Math.round(orderAmount * 0.1); // 10% savings estimate
          adminController.incrementRealStats('money_saved', estimatedSavings);
        }
      } catch (statsError) {
        console.warn('⚠️ Failed to update statistics:', statsError.message);
        // Don't fail the order for stats issues
      }

      res.json({
        success: true,
        data: {
          orderId: order.id,
          oid: order.oid,
          state: order.state,
          clientId: clientId,
          deliveryInfo: order.delivery,
          items: order.items || [orderData.ticket_group]
        }
      });

        } catch (error) {
            // console.log('error: ', error);
            console.error('❌ Checkout processing error:', error.message);

            if (error.response?.status === 422) {
                const errorData = error.response.data;
                res.status(400).json({
                    success: false,
                    message: 'Order validation failed',
                    details: errorData?.message || errorData?.error,
                    error: error.message
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Checkout failed',
                    error: error.message
                });
            }
        }
    }

    /**
     * Get order status
     * GET /api/checkout/order/:orderId
     */
    async getOrderStatus(req, res) {
        try {
            const { orderId } = req.params;

            if (!orderId) {
                return res.status(400).json({
                    success: false,
                    message: 'Order ID is required'
                });
            }

            const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
            const path = `/v9/orders/${orderId}`;

            const headers = tevoSignature.getSignedHeaders({
                method: 'GET',
                host,
                path
            });

            const response = await axios.get(
                `${config.ticketEvolution.apiUrl}/orders/${orderId}`,
                {
                    headers,
                    timeout: config.ticketEvolution.timeout
                }
            );

            const order = response.data.order || response.data;

            res.json({
                success: true,
                data: {
                    id: order.id,
                    oid: order.oid,
                    state: order.state,
                    total: order.total,
                    created_at: order.created_at,
                    delivery: order.delivery,
                    items: order.items || [],
                    client: order.client
                }
            });

        } catch (error) {
            console.error('❌ Error getting order status:', error.message);

            if (error.response?.status === 404) {
                res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Failed to get order status',
                    error: error.message
                });
            }
        }
    }

    /**
     * Helper method to get ticket group details
     */
    async _getTicketGroup(ticketGroupId) {
        try {
            const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
            const path = `/v9/ticket_groups/${ticketGroupId}`;

            const headers = tevoSignature.getSignedHeaders({
                method: 'GET',
                host,
                path
            });

            const response = await axios.get(
                `${config.ticketEvolution.apiUrl}/ticket_groups/${ticketGroupId}`,
                {
                    headers,
                    timeout: config.ticketEvolution.timeout
                }
            );

            return response.data.ticket_group || response.data;
        } catch (error) {
            console.error(`❌ Error fetching ticket group ${ticketGroupId}:`, error.message);
            return null;
        }
    }

    /**
     * Internal helper for creating clients
     */
    async _createClientInternal({ name, email, phone, address }) {
        const clientData = {
            clients: [
                {
                    name: name.trim(),
                    email_addresses: [
                        {
                            label: 'home',
                            address: email.trim(),
                            is_primary: true
                        }
                    ],
                    phone_numbers: [
                        {
                            label: 'cell',
                            country_code: '+1',
                            number: phone.replace(/\D/g, ''),
                            is_primary: true
                        }
                    ],
                    ...(address && {
                        addresses: [{
                            label: 'billing',
                            street_address: address.line1 || '',
                            extended_address: address.line2 || '',
                            locality: address.city || '',
                            region: address.state || '',
                            postal_code: address.postal_code || '',
                            country_code: address.country_code || 'US',
                            is_primary_billing: true
                        }]
                    })
                }
            ]
        };

        const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
        const path = '/v9/clients';

        const headers = tevoSignature.getSignedHeaders({
            method: 'POST',
            host,
            path,
            body: clientData
        });

        const response = await axios.post(
            `${config.ticketEvolution.apiUrl}/clients`,
            clientData,
            {
                headers,
                timeout: config.ticketEvolution.timeout
            }
        );

        const client = response.data.clients?.[0] || response.data.client;

        if (!client || !client.id) {
            throw new Error('Invalid client response from TEvo API');
        }

        return {
            clientId: client.id,
            emailAddressId: client.email_addresses?.[0]?.id,
            phoneNumberId: client.phone_numbers?.[0]?.id,
            addressId: client.addresses?.[0]?.id
        };
    }

    /**
     * Internal helper for delivery pricing
     */
    async _getDeliveryPricingInternal(ticketGroupId, address = null) {
        const ticketGroup = await this._getTicketGroup(ticketGroupId);

        if (!ticketGroup) {
            throw new Error('Ticket group not found');
        }

        const format = ticketGroup.format;
        let deliveryOptions = [];

        if (format === 'Eticket') {
            deliveryOptions = [{
                type: 'Eticket',
                cost: 0,
                description: 'Electronic Delivery - Instant'
            }];
        } else if (format === 'TM_mobile' || format === 'TMMobile') {
            deliveryOptions = [{
                type: 'TMMobile',
                cost: 0,
                description: 'Mobile Transfer - Instant'
            }];
        } else {
            // Physical tickets
            deliveryOptions = [{
                type: 'FedEx',
                cost: 15.00,
                description: 'FedEx Standard Shipping'
            }];
        }

        return {
            ticketGroupId,
            format,
            shippingOptions: deliveryOptions
        };
    }

    /**
     * Internal helper for tax quotes
     */
    async _getTaxQuoteInternal({ ticketGroupId, quantity, retailPrice, shipping = 0, serviceFee = 0 }) {
        const taxData = {
            ticket_group_id: ticketGroupId,
            quantity: parseInt(quantity),
            retail: {
                price: parseFloat(retailPrice),
                shipping: parseFloat(shipping),
                service_fee: parseFloat(serviceFee)
            }
        };

        const host = tevoSignature.extractHost(config.ticketEvolution.apiUrl);
        const path = '/v9/tax_quotes';

        const headers = tevoSignature.getSignedHeaders({
            method: 'POST',
            host,
            path,
            body: taxData
        });

        const response = await axios.post(
            `${config.ticketEvolution.apiUrl}/tax_quotes`,
            taxData,
            {
                headers,
                timeout: config.ticketEvolution.timeout
            }
        );

        const taxQuote = response.data;

        return {
            taxAmount: taxQuote.retail?.tax || 0,
            signature: taxQuote.tax_signature,
            breakdown: taxQuote.retail
        };
    }
}

module.exports = new CheckoutController();
