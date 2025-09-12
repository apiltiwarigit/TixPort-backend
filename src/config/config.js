require('dotenv').config();

module.exports = {
  // Server Configuration
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Ticket Evolution API Configuration
  ticketEvolution: {
    apiToken: process.env.TICKET_EVOLUTION_API_TOKEN,
    apiSecret: process.env.TICKET_EVOLUTION_API_SECRET,
    // Use sandbox by default, production when explicitly set
    apiUrl: process.env.TEVO_API_HOST 
      ? `https://${process.env.TEVO_API_HOST}/v9`
      : 'https://api.sandbox.ticketevolution.com/v9',
    environment: process.env.TICKET_EVOLUTION_ENV || 'sandbox', // sandbox or production
    officeId: process.env.TEVO_OFFICE_ID || '8271', // Our office/seller ID
    timeout: 10000,
    retryAttempts: 3,
  },
  
  // Braintree Configuration (via TEvo v9)
  braintree: {
    // Client tokens obtained from TEvo API dynamically
    sandbox: process.env.TICKET_EVOLUTION_ENV !== 'production',
  },
  
  // Database Configuration
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/tixport',
  },
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'default_jwt_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRE || '7d',
  },
  
  // CORS Configuration
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  
  // Rate Limiting - More generous in development
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || (process.env.NODE_ENV === 'development' ? 60 * 60 * 1000 : 15 * 60 * 1000), // 60 min in dev, 15 min in prod
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'development' ? 500 : 100), // 500 in dev, 100 in prod
  },
  
  // Pagination
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
};

