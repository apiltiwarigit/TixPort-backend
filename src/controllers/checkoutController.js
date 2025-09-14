const axios = require('axios');
const config = require('../config/config');
const tevoSignature = require('../services/tevoSignatureService');
const ticketEvolutionService = require('../services/ticketEvolutionService');

/**
 * Checkout Controller - v9/Braintree Implementation
 * 
 * Handles the complete checkout workflow using TEvo v9 API with Braintree payments
 * This replaces the previous v10/Stripe implementation
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

        if (!config.ticketEvolution.officeId) {
            throw new Error('TEVO_OFFICE_ID is required for v9 checkout');
        }
    }

    /**
     * Get Braintree client token for frontend
     * POST /api/payments/braintree/client-token
     */
    async getBraintreeClientToken(req, res) {
        try {
            const { clientId } = req.body;

            if (!clientId) {
                return res.status(400).json({
                    success: false,
                    message: 'Client ID is required'
                });
            }

            const tokenResponse = await ticketEvolutionService.getBraintreeClientToken(clientId);

            res.json({
                success: true,
                clientToken: tokenResponse.client_token
            });

        } catch (error) {
            console.error('❌ Error getting Braintree client token:', error.message);
            res.status(500).json({
                success: false,
                message: 'Failed to get payment client token',
                error: error.message
            });
        }
    }

    /**
     * Create or lookup a Client in TEvo v9
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

            // Prepare client data for TEvo v9
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

            const response = await ticketEvolutionService.createClient(clientData);
            const client = response.clients?.[0] || response.client;

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
                    billingAddressId: client.addresses?.[0]?.id
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

            // Get the ticket group to determine format
            const ticketGroup = await ticketEvolutionService.getTicketGroup(ticketGroupId);

            if (!ticketGroup) {
                return res.status(404).json({
                    success: false,
                    message: 'Ticket group not found'
                });
            }

            const format = ticketGroup.format;
            const deliveryType = ticketEvolutionService.mapDeliveryTypeFromFormat(format);
            let deliveryOptions = [];

            // Handle different ticket formats
            if (deliveryType === 'Eticket') {
                deliveryOptions = [{
                    type: 'Eticket',
                    cost: 0,
                    description: 'Electronic Delivery - Instant'
                }];
            } else if (deliveryType === 'TMMobile') {
                deliveryOptions = [{
                    type: 'TMMobile',
                    cost: 0,
                    description: 'Mobile Transfer - Instant'
                }];
            } else {
                // Physical tickets - get shipping suggestion from TEvo
                if (address) {
                    try {
                        const suggestion = await ticketEvolutionService.getShipmentSuggestion({
                            ticket_group_id: ticketGroupId,
                            address_attributes: {
                                street_address: address.line1 || '',
                                extended_address: address.line2 || '',
                                locality: address.city || '',
                                region: address.state || '',
                                postal_code: address.postal_code || '',
                                country_code: address.country_code || 'US'
                            }
                        });

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
                    deliveryType,
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

            const taxQuote = await ticketEvolutionService.createTaxQuote({
                ticket_group_id: ticketGroupId,
                quantity: parseInt(quantity),
                retail: {
                    price: parseFloat(retailPrice),
                    shipping: parseFloat(shipping),
                    service_fee: parseFloat(serviceFee)
                }
            });

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
            const { ticketGroupId, quantity, retailUnitPrice, shippingAddress } = req.body;

            if (!ticketGroupId || !quantity || !retailUnitPrice) {
                return res.status(400).json({
                    success: false,
                    message: 'Ticket group ID, quantity, and retail unit price are required'
                });
            }

            // Get delivery pricing
            const deliveryResult = await this._getDeliveryPricingInternal(ticketGroupId, shippingAddress);

            // Get tax quote
            let taxQuote = null;
            try {
                const taxResponse = await ticketEvolutionService.createTaxQuote({
                    ticket_group_id: ticketGroupId,
                    quantity,
                    retail: {
                        price: retailUnitPrice,
                        shipping: deliveryResult.shippingOptions[0]?.cost || 0,
                        service_fee: 0
                    }
                });

                taxQuote = {
                    tax_amount: taxResponse.retail?.tax || 0,
                    signature: taxResponse.tax_signature
                };
            } catch (taxError) {
                console.warn('⚠️ Tax quote failed, proceeding without:', taxError.message);
            }

            res.json({
                success: true,
                data: {
                    shippingOptions: deliveryResult.shippingOptions,
                    deliveryType: deliveryResult.deliveryType,
                    taxQuote: taxQuote
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
     * Process the complete v9 checkout with Braintree
     * POST /api/checkout/process
     */
    async processCheckout(req, res) {
        try {
            const {
                tevoClientId,
                braintreeNonce,
                ticketGroupId,
                quantity,
                retailUnitPrice,
                email,
                phone,
                shippingAddress,
                sessionId,
                isCartCheckout = false,
                cartItems // For future cart support
            } = req.body;

            // Validate required fields
            if (!braintreeNonce || !ticketGroupId || !quantity || !retailUnitPrice || !email || !phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required checkout information'
                });
            }

            // Get client IP for fraud protection
            const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || '127.0.0.1';

            // Ensure IPv4 format if possible
            const ipv4 = clientIP.includes('::ffff:') ? clientIP.replace('::ffff:', '') : clientIP;

            let clientId = tevoClientId;
            let billingAddressId = null;

            // Create client if not provided
            if (!clientId) {
                const clientResult = await this._createClientInternal({
                    name: `${email.split('@')[0]}`, // Use email prefix as fallback name
                    email,
                    phone,
                    address: shippingAddress
                });
                clientId = clientResult.clientId;
                billingAddressId = clientResult.billingAddressId;
            }

            // Get ticket group to determine delivery type
            const ticketGroup = await ticketEvolutionService.getTicketGroup(ticketGroupId);
            if (!ticketGroup) {
                throw new Error('Ticket group not found');
            }

            const deliveryType = ticketEvolutionService.mapDeliveryTypeFromFormat(ticketGroup.format);

            // Get shipping cost for physical tickets
            let shipping = 0;
            if (deliveryType === 'FedEx' && shippingAddress) {
                try {
                    const shippingSuggestion = await ticketEvolutionService.getShipmentSuggestion({
                        ticket_group_id: ticketGroupId,
                        address_attributes: {
                            street_address: shippingAddress.line1 || '',
                            extended_address: shippingAddress.line2 || '',
                            locality: shippingAddress.city || '',
                            region: shippingAddress.state || '',
                            postal_code: shippingAddress.postal_code || '',
                            country_code: shippingAddress.country_code || 'US'
                        }
                    });
                    shipping = shippingSuggestion.cost || 15.00;
                } catch (shippingError) {
                    console.warn('⚠️ Shipping suggestion failed, using default cost:', shippingError.message);
                    shipping = 15.00;
                }
            }

            // Get tax quote
            let tax = 0;
            let taxSignature = null;
            try {
                const taxResponse = await ticketEvolutionService.createTaxQuote({
                    ticket_group_id: ticketGroupId,
                    quantity,
                    retail: {
                        price: retailUnitPrice,
                        shipping,
                        service_fee: 0
                    }
                });
                tax = taxResponse.retail?.tax || 0;
                taxSignature = taxResponse.tax_signature;
            } catch (taxError) {
                console.warn('⚠️ Tax quote failed, proceeding without tax:', taxError.message);
            }

            // Build shipment object
            const shipment = {
                type: deliveryType,
                email_address_attributes: { address: email },
                phone_number_attributes: { number: phone.replace(/\D/g, '') },
                items: [{
                    ticket_group_id: ticketGroupId,
                    quantity: parseInt(quantity),
                    price: parseFloat(retailUnitPrice)
                }]
            };

            // Add shipping address for physical tickets
            if (deliveryType === 'FedEx' && shippingAddress) {
                shipment.address_attributes = {
                    street_address: shippingAddress.line1 || '',
                    extended_address: shippingAddress.line2 || '',
                    locality: shippingAddress.city || '',
                    region: shippingAddress.state || '',
                    postal_code: shippingAddress.postal_code || '',
                    country_code: shippingAddress.country_code || 'US'
                };
            }

            // Create order via v9 API
            const orderResponse = await ticketEvolutionService.createOrderV9({
                seller_id: config.ticketEvolution.officeId,
                client_id: clientId,
                billing_address_id: billingAddressId,
                created_by_ip_address: ipv4,
                session_id: sessionId || `session_${Date.now()}`,
                shipment,
                totals: {
                    service_fee: 0,
                    shipping,
                    discount: 0,
                    tax,
                    tax_signature: taxSignature
                },
                payment: {
                    payment_method_nonce: braintreeNonce
                }
            });

            const order = orderResponse.orders?.[0] || orderResponse.order;

            if (!order) {
                throw new Error('Invalid order response from TEvo API');
            }

            console.log(`✅ v9 Order placed successfully: ${order.oid || order.id}`);

            // Update real statistics (async, don't wait)
            try {
                const AdminController = require('./adminController');
                const adminController = new AdminController();

                // Increment tickets sold
                await adminController.incrementRealStats('tickets_sold', quantity);

                // Calculate money saved (simple estimate: 10% of order amount)
                const orderAmount = retailUnitPrice * quantity + shipping + tax;
                if (orderAmount > 0) {
                    const estimatedSavings = Math.round(orderAmount * 0.1); // 10% savings estimate
                    await adminController.incrementRealStats('money_saved', estimatedSavings);
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
                    deliveryType,
                    total: {
                        subtotal: retailUnitPrice * quantity,
                        shipping,
                        tax,
                        total: retailUnitPrice * quantity + shipping + tax
                    },
                    items: order.items || [{
                        ticket_group_id: ticketGroupId,
                        quantity,
                        price: retailUnitPrice
                    }]
                }
            });

        } catch (error) {
            console.error('❌ v9 Checkout processing error:', error.message);

            // Map common v9 errors
            if (error.response?.status === 422) {
                const errorData = error.response.data;
                let errorMessage = 'Order validation failed';

                if (errorData?.message?.includes('Incorrect Delivery Specified')) {
                    errorMessage = 'Delivery type does not match ticket format. Please refresh and try again.';
                } else if (errorData?.message?.includes('Not enough tickets') || errorData?.message?.includes('InvalidTicketSplit')) {
                    errorMessage = 'Ticket availability has changed. Please select tickets again.';
                } else if (errorData?.message?.includes('Price changed')) {
                    errorMessage = 'Ticket price has changed. Please refresh and try again.';
                }

                res.status(400).json({
                    success: false,
                    message: errorMessage,
                    details: errorData?.message || errorData?.error,
                    error: error.message
                });
            } else if (error.response?.status === 401) {
                res.status(401).json({
                    success: false,
                    message: 'API signature validation failed',
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

    // ===========================
    // HELPER METHODS
    // ===========================

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

        const response = await ticketEvolutionService.createClient(clientData);
        const client = response.clients?.[0] || response.client;

        if (!client || !client.id) {
            throw new Error('Invalid client response from TEvo API');
        }

        return {
            clientId: client.id,
            emailAddressId: client.email_addresses?.[0]?.id,
            phoneNumberId: client.phone_numbers?.[0]?.id,
            billingAddressId: client.addresses?.[0]?.id
        };
    }

    /**
     * Internal helper for delivery pricing
     */
    async _getDeliveryPricingInternal(ticketGroupId, address = null) {
        const ticketGroup = await ticketEvolutionService.getTicketGroup(ticketGroupId);

        if (!ticketGroup) {
            throw new Error('Ticket group not found');
        }

        const format = ticketGroup.format;
        const deliveryType = ticketEvolutionService.mapDeliveryTypeFromFormat(format);
        let deliveryOptions = [];

        if (deliveryType === 'Eticket') {
            deliveryOptions = [{
                type: 'Eticket',
                cost: 0,
                description: 'Electronic Delivery - Instant'
            }];
        } else if (deliveryType === 'TMMobile') {
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
            deliveryType,
            shippingOptions: deliveryOptions
        };
    }
}

module.exports = new CheckoutController();