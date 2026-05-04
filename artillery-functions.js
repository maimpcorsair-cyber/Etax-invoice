/**
 * Artillery load test processor functions for Thai e-Tax Invoice system
 * 
 * Usage:
 *   artillery run artillery-load-test.yml
 *   artillery run artillery-load-test.yml --output report.json
 *   artillery report report.json
 * 
 * Environment variables:
 *   BASE_URL     - Target server (default: http://localhost:4000)
 *   EMAIL        - Test user email (default: admin@siamtech.co.th)
 *   PASSWORD     - Test user password (default: Admin@123456)
 *   DURATION_MIN - Override minimum test duration in minutes
 */

const axios = require('axios');

/**
 * Login function - authenticates and sets token variable
 * Called at the start of each scenario to ensure valid JWT
 */
async function loginAndSetToken(requestParams, vars, context, events) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
  const email = process.env.EMAIL || 'admin@siamtech.co.th';
  const password = process.env.PASSWORD || 'Admin@123456';
  
  try {
    const response = await axios.post(`${baseUrl}/api/auth/login`, {
      email,
      password
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.token) {
      vars.token = response.data.token;
      
      // Extract companyId from token payload if available
      if (response.data.companyId) {
        vars.companyId = response.data.companyId;
      }
      
      events.emit('counter', 'login_success', 1);
    } else {
      events.emit('counter', 'login_failed', 1);
      events.emit('error', 'No token in login response');
    }
  } catch (error) {
    events.emit('counter', 'login_error', 1);
    const errorMsg = error.response?.data?.message || error.message;
    events.emit('error', `Login failed: ${errorMsg}`);
  }
}

/**
 * Add auth header to request
 * Called via beforeRequest hook in scenarios
 */
function addAuthHeader(requestParams, vars, context) {
  if (vars.token) {
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['Authorization'] = `Bearer ${vars.token}`;
  }
  return requestParams;
}

/**
 * Handle 401 responses - re-authenticate and retry
 * Called via afterResponse hook
 */
async function handle401ReLogin(requestParams, response, vars, context, events) {
  if (response.statusCode === 401) {
    events.emit('counter', 'auth_expired', 1);
    
    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    const email = process.env.EMAIL || 'admin@siamtech.co.th';
    const password = process.env.PASSWORD || 'Admin@123456';
    
    try {
      const response = await axios.post(`${baseUrl}/api/auth/login`, {
        email,
        password
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data && response.data.token) {
        vars.token = response.data.token;
        requestParams.headers['Authorization'] = `Bearer ${response.data.token}`;
        events.emit('counter', 'relogin_success', 1);
      }
    } catch (error) {
      events.emit('counter', 'relogin_failed', 1);
      events.emit('error', `Re-login failed: ${error.message}`);
    }
  }
  
  return response;
}

/**
 * Create draft invoice payload
 * Generates realistic invoice data for POST /api/invoices
 */
function getDraftInvoicePayload(vars) {
  return {
    type: 'T01',
    customerId: vars.customerId || null,
    customerName: 'Load Test Customer',
    items: [
      {
        description: `Load Test Item ${Date.now()}`,
        quantity: Math.floor(Math.random() * 10) + 1,
        unitPrice: Math.floor(Math.random() * 1000) + 100,
        vatRate: 7,
        total: 0 // calculated by backend
      }
    ],
    seller: {
      branchId: '00000',
      taxId: '1234567890123',
      name: 'บริษัท ไทยเทค จำกัด',
      address: '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
      phone: '021234567',
      email: 'test@siamtech.co.th'
    },
    paymentMethod: 'CASH',
    notes: "Load test - " + new Date().toISOString()
  };
}

/**
 * Set random delay between requests (simulates real user behavior)
 */
function randomDelay(vars) {
  const minDelay = parseInt(process.env.MIN_DELAY_MS) || 100;
  const maxDelay = parseInt(process.env.MAX_DELAY_MS) || 500;
  return Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
}

module.exports = {
  loginAndSetToken,
  addAuthHeader,
  handle401ReLogin,
  getDraftInvoicePayload,
  randomDelay
};