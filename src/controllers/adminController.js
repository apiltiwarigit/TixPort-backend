const supabaseService = require('../services/supabaseService');
const ticketEvolutionService = require('../services/ticketEvolutionService');

class AdminController {
  
  // ===========================
  // USER MANAGEMENT
  // ===========================

  /**
   * Get all users with their roles
   */
  async getUsers(req, res) {
    try {
      const { page = 1, limit = 50, search = '' } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Get users from auth.users with their profiles and roles
      let query = supabaseService.adminClient
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          created_at,
          updated_at,
          user_roles (
            role,
            granted_at,
            granted_by
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
      }

      const { data: users, error, count } = await query;

      if (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch users',
          error: error.message
        });
      }

      // Get total count for pagination
      const { count: totalCount } = await supabaseService.adminClient
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount,
            totalPages: Math.ceil(totalCount / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('Error in getUsers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error.message
      });
    }
  }

  /**
   * Update user role
   */
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const currentUserId = req.userId;
      const currentUserRole = req.userRole;

      // Validate role
      if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be admin or user',
          code: 'INVALID_ROLE'
        });
      }

      // Only owner can grant owner role
      if (role === 'owner' && currentUserRole !== 'owner') {
        return res.status(403).json({
          success: false,
          message: 'Only owner can grant owner role',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      // Prevent users from changing their own role
      if (userId === currentUserId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change your own role',
          code: 'SELF_ROLE_CHANGE'
        });
      }

      // Upsert user role
      const { data, error } = await supabaseService.adminClient
        .from('user_roles')
        .upsert({
          id: userId,
          role: role,
          granted_by: currentUserId,
          granted_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating user role:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update user role',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: data,
        message: `User role updated to ${role}`
      });
    } catch (error) {
      console.error('Error in updateUserRole:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user role',
        error: error.message
      });
    }
  }

  // ===========================
  // HERO SECTION MANAGEMENT
  // ===========================

  /**
   * Get all hero sections
   */
  async getHeroSections(req, res) {
    try {
      const { data: heroSections, error } = await supabaseService.adminClient
        .from('hero_sections')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching hero sections:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch hero sections',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: heroSections
      });
    } catch (error) {
      console.error('Error in getHeroSections:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch hero sections',
        error: error.message
      });
    }
  }

  /**
   * Get active hero sections for public display
   */
  async getActiveHeroSections(req, res) {
    try {
      const { data: heroSections, error } = await supabaseService.anonClient
        .from('hero_sections')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching active hero sections:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch hero sections',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: heroSections
      });
    } catch (error) {
      console.error('Error in getActiveHeroSections:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch hero sections',
        error: error.message
      });
    }
  }

  /**
   * Create hero section
   */
  async createHeroSection(req, res) {
    try {
      const { 
        title, 
        description, 
        image_url, 
        primary_button_text = 'View Tickets',
        primary_button_url,
        secondary_button_text = 'View Dates',
        secondary_button_url,
        is_active = false,
        display_order = 0
      } = req.body;

      if (!title) {
        return res.status(400).json({
          success: false,
          message: 'Title is required',
          code: 'MISSING_TITLE'
        });
      }

      const { data, error } = await supabaseService.adminClient
        .from('hero_sections')
        .insert({
          title,
          description,
          image_url,
          primary_button_text,
          primary_button_url,
          secondary_button_text,
          secondary_button_url,
          is_active,
          display_order,
          created_by: req.userId
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating hero section:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create hero section',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: data,
        message: 'Hero section created successfully'
      });
    } catch (error) {
      console.error('Error in createHeroSection:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create hero section',
        error: error.message
      });
    }
  }

  /**
   * Update hero section
   */
  async updateHeroSection(req, res) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };
      delete updateData.id; // Remove id from update data
      delete updateData.created_by; // Remove created_by from update data
      delete updateData.created_at; // Remove created_at from update data

      const { data, error } = await supabaseService.adminClient
        .from('hero_sections')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating hero section:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update hero section',
          error: error.message
        });
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Hero section not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        data: data,
        message: 'Hero section updated successfully'
      });
    } catch (error) {
      console.error('Error in updateHeroSection:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update hero section',
        error: error.message
      });
    }
  }

  /**
   * Delete hero section
   */
  async deleteHeroSection(req, res) {
    try {
      const { id } = req.params;

      const { data, error } = await supabaseService.adminClient
        .from('hero_sections')
        .delete()
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error deleting hero section:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete hero section',
          error: error.message
        });
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Hero section not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        message: 'Hero section deleted successfully'
      });
    } catch (error) {
      console.error('Error in deleteHeroSection:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete hero section',
        error: error.message
      });
    }
  }

  // ===========================
  // CATEGORY MANAGEMENT
  // ===========================

  /**
   * Sync categories from TicketEvolution API
   */
  async syncCategories(req, res) {
    try {
      console.log('Starting category sync from TicketEvolution API...');

      // Get categories from TicketEvolution API
      const result = await ticketEvolutionService.getCategories();
      
      if (!result.categories || result.categories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No categories received from API',
          code: 'NO_CATEGORIES'
        });
      }

      console.log(`Received ${result.categories.length} categories from API`);

      // Use the database function to sync categories
      const { data: syncResult, error } = await supabaseService.adminClient
        .rpc('sync_categories_from_api', { 
          api_categories: JSON.stringify(result.categories) 
        });

      if (error) {
        console.error('Error syncing categories:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to sync categories',
          error: error.message
        });
      }

      console.log('Category sync completed:', syncResult);

      res.json({
        success: true,
        data: {
          inserted: syncResult[0]?.inserted_count || 0,
          updated: syncResult[0]?.updated_count || 0,
          total: syncResult[0]?.total_count || 0,
          api_total: result.categories.length
        },
        message: 'Categories synced successfully'
      });
    } catch (error) {
      console.error('Error in syncCategories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync categories',
        error: error.message
      });
    }
  }

  /**
   * Get all categories (for admin management)
   */
  async getCategories(req, res) {
    try {
      const { data: categories, error } = await supabaseService.adminClient
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch categories',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: categories
      });
    } catch (error) {
      console.error('Error in getCategories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: error.message
      });
    }
  }

  /**
   * Update category visibility
   */
  async updateCategoryVisibility(req, res) {
    try {
      const { id } = req.params;
      const { is_visible } = req.body;

      if (typeof is_visible !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'is_visible must be a boolean',
          code: 'INVALID_VISIBILITY'
        });
      }

      const { data, error } = await supabaseService.adminClient
        .from('categories')
        .update({ is_visible })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) {
        console.error('Error updating category visibility:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category visibility',
          error: error.message
        });
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Category not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        data: data,
        message: `Category ${is_visible ? 'shown' : 'hidden'} successfully`
      });
    } catch (error) {
      console.error('Error in updateCategoryVisibility:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update category visibility',
        error: error.message
      });
    }
  }

  // ===========================
  // HOMEPAGE CATEGORIES
  // ===========================

  /**
   * Get homepage categories
   */
  async getHomepageCategories(req, res) {
    try {
      const { data: homepageCategories, error } = await supabaseService.anonClient
        .from('homepage_categories')
        .select(`
          id,
          display_order,
          is_active,
          created_at,
          categories (
            id,
            name,
            slug
          )
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching homepage categories:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch homepage categories',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: homepageCategories
      });
    } catch (error) {
      console.error('Error in getHomepageCategories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch homepage categories',
        error: error.message
      });
    }
  }

  /**
   * Set homepage categories
   */
  async setHomepageCategories(req, res) {
    try {
      const { category_ids } = req.body;

      if (!Array.isArray(category_ids) || category_ids.length === 0 || category_ids.length > 3) {
        return res.status(400).json({
          success: false,
          message: 'Must provide 1-3 category IDs',
          code: 'INVALID_CATEGORIES'
        });
      }

      // First, deactivate all current homepage categories
      await supabaseService.adminClient
        .from('homepage_categories')
        .update({ is_active: false })
        .eq('is_active', true);

      // Then, insert/activate the new ones
      const insertData = category_ids.map((categoryId, index) => ({
        category_id: parseInt(categoryId),
        display_order: index + 1,
        is_active: true,
        created_by: req.userId
      }));

      const { data, error } = await supabaseService.adminClient
        .from('homepage_categories')
        .upsert(insertData, {
          onConflict: 'category_id'
        })
        .select(`
          id,
          display_order,
          is_active,
          categories (
            id,
            name,
            slug
          )
        `);

      if (error) {
        console.error('Error setting homepage categories:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to set homepage categories',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: data,
        message: 'Homepage categories updated successfully'
      });
    } catch (error) {
      console.error('Error in setHomepageCategories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to set homepage categories',
        error: error.message
      });
    }
  }

  // ===========================
  // PROJECT CONFIG
  // ===========================

  /**
   * Get all config settings
   */
  async getConfig(req, res) {
    try {
      const { type } = req.query;

      let query = supabaseService.adminClient
        .from('project_config')
        .select('*')
        .order('config_key', { ascending: true });

      if (type) {
        query = query.eq('config_type', type);
      }

      const { data: config, error } = await query;

      if (error) {
        console.error('Error fetching config:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch config',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      console.error('Error in getConfig:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch config',
        error: error.message
      });
    }
  }

  /**
   * Get public config settings (for frontend)
   */
  async getPublicConfig(req, res) {
    try {
      const { data: config, error } = await supabaseService.anonClient
        .from('project_config')
        .select('config_key, config_value, config_type')
        .eq('is_public', true);

      if (error) {
        console.error('Error fetching public config:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch config',
          error: error.message
        });
      }

      // Transform to key-value object
      const configObject = {};
      config.forEach(item => {
        configObject[item.config_key] = item.config_value;
      });

      res.json({
        success: true,
        data: configObject
      });
    } catch (error) {
      console.error('Error in getPublicConfig:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch config',
        error: error.message
      });
    }
  }

  /**
   * Update config setting
   */
  async updateConfig(req, res) {
    try {
      const { config_key, config_value, description, config_type = 'general', is_public = false } = req.body;

      if (!config_key || config_value === undefined) {
        return res.status(400).json({
          success: false,
          message: 'config_key and config_value are required',
          code: 'MISSING_FIELDS'
        });
      }

      const { data, error } = await supabaseService.adminClient
        .from('project_config')
        .upsert({
          config_key,
          config_value,
          description,
          config_type,
          is_public,
          updated_by: req.userId
        }, {
          onConflict: 'config_key'
        })
        .select()
        .single();

      if (error) {
        console.error('Error updating config:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update config',
          error: error.message
        });
      }

      res.json({
        success: true,
        data: data,
        message: 'Config updated successfully'
      });
    } catch (error) {
      console.error('Error in updateConfig:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update config',
        error: error.message
      });
    }
  }

  /**
   * Delete config setting
   */
  async deleteConfig(req, res) {
    try {
      const { config_key } = req.params;

      const { data, error } = await supabaseService.adminClient
        .from('project_config')
        .delete()
        .eq('config_key', config_key)
        .select()
        .single();

      if (error) {
        console.error('Error deleting config:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete config',
          error: error.message
        });
      }

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Config setting not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        message: 'Config setting deleted successfully'
      });
    } catch (error) {
      console.error('Error in deleteConfig:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete config',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();
