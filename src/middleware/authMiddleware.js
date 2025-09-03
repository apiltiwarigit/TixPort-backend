const supabaseService = require('../services/supabaseService');

/**
 * Middleware to verify authentication token
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    // Verify token with Supabase
    const user = await supabaseService.verifyToken(token);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const user = await supabaseService.verifyToken(token);
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (error) {
    // Don't fail on optional auth errors, just log them
    console.warn('Optional auth error:', error);
    next();
  }
};

/**
 * Admin role middleware
 */
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    // Check if user has admin role
    const userProfile = await supabaseService.getUserProfile(req.userId);
    
    if (!userProfile || userProfile.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Rate limiting for auth endpoints
 */
const authRateLimit = (req, res, next) => {
  // This would typically use Redis or similar for production
  // For now, we'll rely on the general rate limiter
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  authRateLimit
};
