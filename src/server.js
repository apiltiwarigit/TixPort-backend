// Track server startup time
global.startTime = Date.now();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const config = require('./config/config');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Create Express app
const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Compression middleware
app.use(compression());

// Logging middleware
if (config.nodeEnv !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static('public'));

// Rate limiting - disabled in development to prevent conflicts with external API rate limits
if (config.nodeEnv !== 'development') {
  app.use('/api', apiLimiter);
} else {
  console.log('⚡ Development mode: Rate limiting disabled for easier API testing');
}

// Health check endpoint (before other routes)
app.get('/health', async (req, res) => {
  const startTime = Date.now();
  console.log('🏥 Health check requested from:', req.ip || req.connection.remoteAddress);

  try {
    const ticketEvolutionService = require('./services/ticketEvolutionService');
    const healthResult = await ticketEvolutionService.healthCheck();

    const responseTime = Date.now() - startTime;
    console.log('✅ Health check completed in', responseTime + 'ms');
    console.log('   Status:', healthResult.status);
    console.log('   Mode:', healthResult.mode);

    res.status(healthResult.status === 'healthy' ? 200 : 503).json({
      ...healthResult,
      server: {
        status: 'running',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        responseTime: responseTime + 'ms'
      }
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Health check failed:', error.message);
    console.error('   Response time:', responseTime + 'ms');

    res.status(503).json({
      status: 'unhealthy',
      message: 'Health check failed',
      error: error.message,
      server: {
        status: 'running',
        uptime: process.uptime(),
        responseTime: responseTime + 'ms'
      }
    });
  }
});

// API routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to TixPort API',
    documentation: '/api/health',
    version: '1.0.0',
  });
});

// 404 handler for non-API routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// Start server only if not in Vercel environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const PORT = config.port;

  console.log('🚀 Starting TixPort Backend Server...');
  console.log('📋 Configuration:');
  console.log('   Port:', PORT);
  console.log('   Environment:', config.nodeEnv);
  console.log('   CORS Origin:', config.cors.origin);
  console.log('   Rate Limit Window:', config.rateLimit.windowMs / 1000 + 's');
  console.log('   Rate Limit Max Requests:', config.rateLimit.maxRequests);
  console.log('   Ticket Evolution Environment:', config.ticketEvolution.environment);
  console.log('   Ticket Evolution URL:', config.ticketEvolution.apiUrl);

  const server = app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    🚀 SERVER STARTED!                         ║
╠══════════════════════════════════════════════════════════════╣
║ Environment: ${config.nodeEnv.padEnd(47)} ║
║ Port: ${PORT.toString().padEnd(54)} ║
║ URL: http://localhost:${PORT.toString().padEnd(42)} ║
║ Health Check: http://localhost:${PORT}/health${' '.repeat(26)} ║
║ API Base: http://localhost:${PORT}/api${' '.repeat(32)} ║
║ Started at: ${new Date().toLocaleString().padEnd(43)} ║
╚══════════════════════════════════════════════════════════════╝

📊 Available endpoints:
   GET  /health          - Health check with TicketEvolution status
   GET  /api/events      - Get events with filtering
   GET  /api/events/:id  - Get single event
   POST /api/tickets     - Get event tickets

🔐 Authentication: ${config.ticketEvolution.apiToken ? '✅ Configured' : '❌ Not configured'}
💾 Database: ${config.database.uri.includes('localhost') ? 'Local MongoDB' : 'Remote Database'}
⏱️  Server ready in ${Date.now() - global.startTime || 0}ms
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received - Initiating graceful shutdown...');
    console.log('   Closing server connections...');
    server.close(() => {
      console.log('✅ Server connections closed');
      console.log('👋 Process terminated gracefully');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received (Ctrl+C) - Initiating graceful shutdown...');
    console.log('   Closing server connections...');
    server.close(() => {
      console.log('✅ Server connections closed');
      console.log('👋 Process terminated gracefully');
      process.exit(0);
    });
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err, promise) => {
    console.error('💥 Unhandled Promise Rejection detected!');
    console.error('   Error:', err.message);
    console.error('   Stack:', err.stack);
    console.error('   Promise:', promise);

    console.log('🚨 Emergency shutdown initiated...');
    server.close(() => {
      console.error('❌ Server forcefully terminated due to unhandled error');
      process.exit(1);
    });
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception detected!');
    console.error('   Error:', err.message);
    console.error('   Stack:', err.stack);

    console.log('🚨 Emergency shutdown initiated...');
    server.close(() => {
      console.error('❌ Server forcefully terminated due to uncaught exception');
      process.exit(1);
    });
  });
}

// Export for Vercel serverless
module.exports = app;

