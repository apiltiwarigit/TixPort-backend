const supabaseService = require('../services/supabaseService');

class AuthController {
  /**
   * Sign in user with email and password
   */
  async signIn(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        });
      }

      const result = await supabaseService.signInUser(email, password);
      
      if (result.error) {
        return res.status(401).json({
          success: false,
          message: result.error.message,
          code: 'AUTH_ERROR'
        });
      }

      // Get or create user profile (non-blocking)
      let profile = null;
      try {
        profile = await supabaseService.getUserProfile(result.user.id);
        if (!profile) {
          const basicProfile = {
            id: result.user.id,
            email: result.user.email,
            first_name: result.user.user_metadata?.first_name || '',
            last_name: result.user.user_metadata?.last_name || '',
            phone: result.user.phone || '',
            avatar_url: result.user.user_metadata?.avatar_url || '',
            newsletter_subscribed: false
          };
          profile = await supabaseService.upsertUserProfile(result.user.id, basicProfile);
        }
      } catch (profileError) {
        console.warn('Profile creation failed during signin (non-critical):', profileError.message);
        // Continue without profile - user can still authenticate
      }

      res.json({
        success: true,
        data: {
          user: result.user,
          session: result.session,
          profile
        }
      });
    } catch (error) {
      console.error('Sign in error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Sign up user with email and password
   */
  async signUp(req, res) {
    try {
      const { email, password, metadata = {} } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        });
      }

      const result = await supabaseService.signUpUser(email, password, metadata);
      
      if (result.error) {
        return res.status(400).json({
          success: false,
          message: result.error.message,
          code: 'SIGNUP_ERROR'
        });
      }

      // Create user profile if user was created (non-blocking)
      let profile = null;
      if (result.user) {
        try {
          const basicProfile = {
            id: result.user.id,
            email: result.user.email,
            first_name: metadata.first_name || '',
            last_name: metadata.last_name || '',
            phone: result.user.phone || '',
            avatar_url: metadata.avatar_url || '',
            newsletter_subscribed: metadata.newsletter_subscribed || false
          };
          profile = await supabaseService.upsertUserProfile(result.user.id, basicProfile);
        } catch (profileError) {
          console.warn('Profile creation failed (non-critical):', profileError.message);
          // Don't fail the entire signup if profile creation fails
          // Profile will be created later when user logs in
        }
      }

      res.json({
        success: true,
        data: {
          user: result.user,
          session: result.session,
          profile
        },
        message: result.user ? 'Account created successfully' : 'Please check your email to confirm your account'
      });
    } catch (error) {
      console.error('Sign up error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Sign out user
   */
  async signOut(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        await supabaseService.signOutUser(token);
      }

      res.json({
        success: true,
        message: 'Signed out successfully'
      });
    } catch (error) {
      console.error('Sign out error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }
  /**
   * Get current user profile
   */
  async getProfile(req, res) {
    try {
      const userId = req.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          code: 'NO_AUTH'
        });
      }

      // Get user profile from database (non-blocking)
      let profile = null;
      try {
        profile = await supabaseService.getUserProfile(userId);

        if (!profile) {
          // If no profile exists, try to create one with basic user info
          const basicProfile = {
            id: userId,
            email: req.user.email,
            first_name: req.user.user_metadata?.first_name || '',
            last_name: req.user.user_metadata?.last_name || '',
            phone: req.user.phone || '',
            avatar_url: req.user.user_metadata?.avatar_url || '',
            newsletter_subscribed: false
          };

          profile = await supabaseService.upsertUserProfile(userId, basicProfile);
        }
      } catch (profileError) {
        console.warn('Profile operations failed (non-critical):', profileError.message);
        // Continue without profile - user can still authenticate
      }

      res.json({
        success: true,
        data: {
          user: req.user,
          profile
        }
      });

    } catch (error) {
      console.error('Error in getProfile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
        error: error.message
      });
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req, res) {
    try {
      const userId = req.userId;
      const updates = req.body;

      // Validate updates
      const allowedFields = [
        'first_name', 
        'last_name', 
        'phone', 
        'avatar_url', 
        'newsletter_subscribed'
      ];

      const profileUpdates = {};
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          profileUpdates[key] = updates[key];
        }
      });

      if (Object.keys(profileUpdates).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update',
          code: 'NO_VALID_FIELDS'
        });
      }

      const updatedProfile = await supabaseService.upsertUserProfile(userId, profileUpdates);

      res.json({
        success: true,
        data: {
          profile: updatedProfile
        },
        message: 'Profile updated successfully'
      });

    } catch (error) {
      console.error('Error in updateProfile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: error.message
      });
    }
  }

  /**
   * Delete user account
   */
  async deleteAccount(req, res) {
    try {
      const userId = req.userId;

      // Delete user profile first
      await supabaseService.deleteUserProfile(userId);

      // Delete user from auth (admin function)
      await supabaseService.deleteUser(userId);

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });

    } catch (error) {
      console.error('Error in deleteAccount:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account',
        error: error.message
      });
    }
  }

  /**
   * Verify authentication status
   */
  async verifyAuth(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'No token provided',
          code: 'NO_TOKEN'
        });
      }

      const user = await supabaseService.verifyToken(token);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      // Get profile if exists
      const profile = await supabaseService.getUserProfile(user.id);

      res.json({
        success: true,
        data: {
          user,
          profile,
          isAuthenticated: true
        }
      });

    } catch (error) {
      console.error('Error in verifyAuth:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication verification failed',
        error: error.message
      });
    }
  }

  /**
   * Refresh user session (client handles token refresh)
   */
  async refreshSession(req, res) {
    try {
      // The actual token refresh is handled by Supabase client
      // This endpoint just verifies the new token
      return this.verifyAuth(req, res);
    } catch (error) {
      console.error('Error in refreshSession:', error);
      res.status(500).json({
        success: false,
        message: 'Session refresh failed',
        error: error.message
      });
    }
  }

  /**
   * Initialize database tables (for development/setup)
   */
  async initializeTables(req, res) {
    try {
      const result = await supabaseService.initializeTables();

      if (result) {
        res.json({
          success: true,
          message: 'Database tables initialized successfully'
        });
      } else {
        res.json({
          success: false,
          message: 'Database initialization completed with warnings. Check console for details.',
          note: 'Please create the profiles table manually in Supabase dashboard if it does not exist.'
        });
      }

    } catch (error) {
      console.error('Error initializing tables:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize database tables',
        error: error.message
      });
    }
  }

  /**
   * Admin: List all users
   */
  async listUsers(req, res) {
    try {
      const { page = 1, limit = 50 } = req.query;

      const users = await supabaseService.listUsers(
        parseInt(page),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: users
      });

    } catch (error) {
      console.error('Error in listUsers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list users',
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();
