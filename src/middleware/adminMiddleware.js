const supabaseService = require('../services/supabaseService');

/**
 * Middleware to check if user has admin or owner role
 */
async function requireAdmin(req, res, next) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    // Check user role in database
    const { data: userRole, error } = await supabaseService.adminClient
      .from('user_roles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking user role:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify admin access',
        code: 'ROLE_CHECK_ERROR'
      });
    }

    if (!userRole || !['admin', 'owner'].includes(userRole.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Add role to request object for further use
    req.userRole = userRole.role;
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Middleware to check if user has owner role
 */
async function requireOwner(req, res, next) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_AUTH'
      });
    }

    // Check if user is the hardcoded owner or has owner role
    const user = req.user;
    if (user && user.email === 'twriapil@gmail.com') {
      req.userRole = 'owner';
      return next();
    }

    // Check user role in database
    const { data: userRole, error } = await supabaseService.adminClient
      .from('user_roles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error checking user role:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify owner access',
        code: 'ROLE_CHECK_ERROR'
      });
    }

    if (!userRole || userRole.role !== 'owner') {
      return res.status(403).json({
        success: false,
        message: 'Owner access required',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    req.userRole = userRole.role;
    next();
  } catch (error) {
    console.error('Owner middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}

/**
 * Middleware to get user role (if any) without requiring specific permissions
 */
async function getUserRole(req, res, next) {
  try {
    const userId = req.userId;
    
    if (!userId) {
      req.userRole = 'guest';
      return next();
    }

    // Check if user is the hardcoded owner
    const user = req.user;
    if (user && user.email === 'twriapil@gmail.com') {
      req.userRole = 'owner';
      return next();
    }

    // Check user role in database
    const { data: userRole, error } = await supabaseService.adminClient
      .from('user_roles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !userRole) {
      req.userRole = 'user'; // Default role
    } else {
      req.userRole = userRole.role;
    }

    next();
  } catch (error) {
    console.error('Get user role middleware error:', error);
    req.userRole = 'user'; // Default on error
    next();
  }
}

module.exports = {
  requireAdmin,
  requireOwner,
  getUserRole
};
