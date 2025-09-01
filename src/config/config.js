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
    apiUrl: process.env.TICKET_EVOLUTION_API_URL || 'https://api.sandbox.ticketevolution.com/v9',
    environment: process.env.TICKET_EVOLUTION_ENV || 'sandbox', // sandbox or production
    timeout: 10000,
    retryAttempts: 3,
    // Mock data fallback configuration
    useMockData: !process.env.TICKET_EVOLUTION_API_TOKEN || process.env.TICKET_EVOLUTION_API_TOKEN === '', // Use mock only if no token
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
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
  
  // Pagination
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
};

