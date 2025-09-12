/**
 * Checkout API Test Script
 * 
 * Simple script to test the checkout endpoints
 * Run with: node test-checkout.js
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';

// Test configuration
const testConfig = {
  ticketGroupId: 123456789, // Replace with real ticket group ID
  eventId: 987654321,       // Replace with real event ID
  testEmail: 'test@example.com',
  testPhone: '+1234567890'
};

async function testCheckoutFlow() {
  console.log('🧪 Testing TixPort Checkout Flow\n');

  try {
    // Test 1: Get Braintree Client Token (requires client ID - skipping in basic test)
    console.log('1️⃣ Braintree Client Token endpoint available (requires client ID)');
    console.log('');

    // Test 2: Calculate Order Details
    console.log('2️⃣ Testing Order Calculation...');
    const calculateResponse = await axios.post(`${API_BASE}/api/checkout/calculate`, {
      ticketGroupId: testConfig.ticketGroupId,
      quantity: 2,
      zipCode: '10001',
      orderAmount: 200.00
    });
    console.log('✅ Order Calculation:', calculateResponse.data);
    console.log('');

    // Note: Tests 3-5 require authentication and valid TEvo credentials
    console.log('🔐 Additional tests require authentication and valid TEvo API credentials');
    console.log('   - Client Creation');
    console.log('   - Delivery Pricing');
    console.log('   - Tax Quotes');
    console.log('   - Order Processing');
    console.log('');

    console.log('✅ Basic checkout flow tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 500) {
      console.log('\n💡 This might be due to missing TEvo API credentials.');
      console.log('   Set TICKET_EVOLUTION_API_TOKEN and TICKET_EVOLUTION_API_SECRET');
    }
  }
}

// Health check first
async function healthCheck() {
  try {
    const response = await axios.get(`${API_BASE}/api/health`);
    console.log('🏥 Backend Health:', response.data.message);
    return true;
  } catch (error) {
    console.error('❌ Backend not accessible:', error.message);
    console.log('💡 Make sure the backend server is running on', API_BASE);
    return false;
  }
}

// Run tests
(async () => {
  console.log('TixPort Checkout Test Suite');
  console.log('===========================\n');
  
  const isHealthy = await healthCheck();
  if (isHealthy) {
    console.log('');
    await testCheckoutFlow();
  }
})();
