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
      const pageNum = parseInt(page);
      const perPage = parseInt(limit);

      // 1) Fetch auth users (emails, timestamps)
      const adminUsersResult = await supabaseService.listUsers(pageNum, perPage);
      const authUsers = adminUsersResult?.users || adminUsersResult?.data?.users || [];

      // Optional: simple client-side search on email until backend-side search is added
      const filteredAuthUsers = search
        ? authUsers.filter((u) =>
            u.email?.toLowerCase().includes(String(search).toLowerCase())
          )
        : authUsers;

      const userIds = filteredAuthUsers.map((u) => u.id);

      // 2) Fetch profiles (names)
      let profilesMap = new Map();
      if (userIds.length > 0) {
        const { data: profilesData } = await supabaseService.adminClient
          .from('profiles')
          .select('id, first_name, last_name, created_at, updated_at')
          .in('id', userIds);
        (profilesData || []).forEach((p) => profilesMap.set(p.id, p));
      }

      // 3) Fetch roles
      let rolesMap = new Map();
      if (userIds.length > 0) {
        const { data: rolesData } = await supabaseService.adminClient
          .from('user_roles')
          .select('id, role, granted_at, granted_by')
          .in('id', userIds);
        (rolesData || []).forEach((r) => rolesMap.set(r.id, r));
      }

      // 4) Merge into unified user objects
      const mergedUsers = filteredAuthUsers.map((u) => {
        const profile = profilesMap.get(u.id) || {};
        const roleRec = rolesMap.get(u.id) || {};
        return {
          id: u.id,
          email: u.email,
          first_name: profile.first_name || null,
          last_name: profile.last_name || null,
          created_at: profile.created_at || u.created_at || null,
          updated_at: profile.updated_at || null,
          last_sign_in_at: u.last_sign_in_at || null,
          role: roleRec.role || 'user',
          role_granted_at: roleRec.granted_at || null,
          role_granted_by: roleRec.granted_by || null,
        };
      });

      res.json({
        success: true,
        data: {
          users: mergedUsers,
          pagination: {
            page: pageNum,
            limit: perPage,
            total: mergedUsers.length,
            totalPages: 1
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
      // Fetch ALL pages of categories from TicketEvolution API
      const allCategories = [];
      const first = await ticketEvolutionService.getCategories(1, 100);
      allCategories.push(...(first.categories || []));
      const totalPages = first.pagination?.total_pages || 1;
      for (let p = 2; p <= totalPages; p++) {
        try {
          const pageResult = await ticketEvolutionService.getCategories(p, 100);
          allCategories.push(...(pageResult.categories || []));
        } catch (e) {
          console.warn(`Warning: failed to fetch categories page ${p}:`, e.message);
        }
      }

      if (allCategories.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No categories received from API',
          code: 'NO_CATEGORIES'
        });
      }

      console.log(`Received ${allCategories.length} categories from API (total pages: ${totalPages})`);

      // Dedupe categories by ID to prevent upsert conflicts within a single batch
      const byId = new Map();
      for (const cat of allCategories) {
        const idNum = parseInt(cat.id, 10);
        if (!byId.has(idNum)) byId.set(idNum, cat);
      }
      const uniqueCategories = Array.from(byId.values());

      // Utility to generate slug
      const toSlug = (name, id) => {
        if (!name) return `category-${id}`;
        return name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .trim();
      };

      // Fetch existing visibility settings to preserve manual changes
      const existingIds = uniqueCategories.map((c) => parseInt(c.id, 10));
      const { data: existingRows } = await supabaseService.adminClient
        .from('categories')
        .select('id, is_visible')
        .in('id', existingIds);
      const idToVisible = new Map();
      (existingRows || []).forEach((row) => idToVisible.set(row.id, row.is_visible));

      // Prepare rows
      const baseRows = uniqueCategories.map((cat) => {
        const id = parseInt(cat.id, 10);
        const parentId = cat.parent ? parseInt(cat.parent.id, 10) : null;
        return {
          id,
          name: cat.name,
          slug: toSlug(cat.name, id),
          // parent_id intentionally omitted in phase 1 to avoid FK constraint
          api_data: cat,
          // Preserve existing visibility; default true only for brand new rows
          is_visible: idToVisible.has(id) ? idToVisible.get(id) : true,
          sync_at: new Date().toISOString(),
        };
      });

      const withParents = uniqueCategories
        .filter((cat) => !!cat.parent)
        .map((cat) => {
          const id = parseInt(cat.id, 10);
          const parentId = parseInt(cat.parent.id, 10);
          return {
            id,
            name: cat.name,
            slug: toSlug(cat.name, id),
            parent_id: parentId,
            api_data: cat,
            // Preserve existing visibility; default true for new
            is_visible: idToVisible.has(id) ? idToVisible.get(id) : true,
            sync_at: new Date().toISOString(),
          };
        });

      // Dedupe baseRows and withParents arrays in case of residual duplicates
      const dedupeById = (rows) => {
        const m = new Map();
        rows.forEach(r => { if (!m.has(r.id)) m.set(r.id, r); });
        return Array.from(m.values());
      };
      const baseRowsUnique = dedupeById(baseRows);
      const withParentsUnique = dedupeById(withParents);

      // Chunk helper
      const chunk = (arr, size) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
        return chunks;
      };

      // Phase 1: upsert all categories without parent_id
      const baseChunks = chunk(baseRowsUnique, 500);
      for (const c of baseChunks) {
        const { error } = await supabaseService.adminClient
          .from('categories')
          .upsert(c, { onConflict: 'id' });
        if (error) {
          console.error('Error during phase 1 upsert:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to sync categories (phase 1)',
            error: error.message,
          });
        }
      }

      // Phase 2: upsert categories with parent_id now that parents exist
      const parentChunks = chunk(withParentsUnique, 500);
      for (const c of parentChunks) {
        const { error } = await supabaseService.adminClient
          .from('categories')
          .upsert(c, { onConflict: 'id' });
        if (error) {
          console.error('Error during phase 2 upsert:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to sync categories (phase 2)',
            error: error.message,
          });
        }
      }

      console.log('Category sync completed: inserted/updated', allCategories.length);

      res.json({
        success: true,
        data: {
          inserted: 0, // Supabase does not return counts per upsert batch here
          updated: 0,
          total: allCategories.length,
          api_total: allCategories.length,
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
   * Get homepage categories (admin version - includes inactive)
   */
  async getHomepageCategories(req, res) {
    try {
      const { data: homepageCategories, error } = await supabaseService.adminClient
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
   * Get homepage categories (public - active only)
   */
  async getPublicHomepageCategories(req, res) {
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
      console.error('Error in getPublicHomepageCategories:', error);
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

      // Read limits from project_config (fallback to min=1, max=4)
      let minLimit = 1;
      let maxLimit = 4;
      try {
        const { data: cfg } = await supabaseService.adminClient
          .from('project_config')
          .select('config_key, config_value')
          .in('config_key', ['min_homepage_categories', 'max_homepage_categories']);
        if (Array.isArray(cfg)) {
          const toNum = (v) => {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') return parseInt(v.replace(/"/g, ''));
            return parseInt(String(v));
          };
          const minRow = cfg.find(r => r.config_key === 'min_homepage_categories');
          const maxRow = cfg.find(r => r.config_key === 'max_homepage_categories');
          if (minRow && minRow.config_value !== undefined && minRow.config_value !== null) {
            const n = toNum(minRow.config_value);
            if (!Number.isNaN(n)) minLimit = n;
          }
          if (maxRow && maxRow.config_value !== undefined && maxRow.config_value !== null) {
            const n = toNum(maxRow.config_value);
            if (!Number.isNaN(n)) maxLimit = n;
          }
        }
      } catch (e) {
        // Ignore and use defaults
      }

      if (!Array.isArray(category_ids) || category_ids.length < minLimit || category_ids.length > maxLimit) {
        return res.status(400).json({
          success: false,
          message: `Must provide ${minLimit}-${maxLimit} category IDs`,
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
          onConflict: 'category_id,is_active'
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
  // DASHBOARD STATS
  // ===========================

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(req, res) {
    try {
      // Fetch all stats in parallel
      const [usersResult, heroSectionsResult, categoriesResult] = await Promise.all([
        // Get total users count
        supabaseService.adminClient
          .from('user_roles')
          .select('id', { count: 'exact', head: true }),
        
        // Get hero sections count
        supabaseService.adminClient
          .from('hero_sections')
          .select('id', { count: 'exact', head: true }),
        
        // Get categories count
        supabaseService.adminClient
          .from('categories')
          .select('id', { count: 'exact', head: true })
      ]);

      // Get last sync time from categories (most recent sync_at)
      const { data: lastSyncData } = await supabaseService.adminClient
        .from('categories')
        .select('sync_at')
        .not('sync_at', 'is', null)
        .order('sync_at', { ascending: false })
        .limit(1);

      const lastSync = lastSyncData && lastSyncData.length > 0 
        ? new Date(lastSyncData[0].sync_at).toLocaleString()
        : 'Never';

      res.json({
        success: true,
        data: {
          totalUsers: usersResult.count || 0,
          heroSections: heroSectionsResult.count || 0,
          categories: categoriesResult.count || 0,
          lastSync
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard stats',
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
      // Allowlist of safe config keys for the public site
      const PUBLIC_KEYS = [
        'site_name',
        'contact_email',
        'contact_phone',
        'contact_address',
        'location_search_radius',
        'max_homepage_categories',
        'min_homepage_categories',
        'maintenance_mode'
      ];

      // Use admin client to avoid RLS blocking non-public but allowlisted keys;
      // we filter strictly by PUBLIC_KEYS before returning to keep it safe.
      const { data: config, error } = await supabaseService.adminClient
        .from('project_config')
        .select('config_key, config_value, config_type')
        .in('config_key', PUBLIC_KEYS);

      if (error) {
        console.error('Error fetching public config:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch config',
          error: error.message
        });
      }

      // Transform to key-value object (preserve JSONB types)
      const configObject = {};
      (config || []).forEach(item => {
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
