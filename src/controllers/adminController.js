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
   * Sync categories from TicketEvolution API (ULTRA FAST - Single JSON Operation)
   */
  async syncCategories(req, res) {
    try {
      console.log('Starting ULTRA-FAST single-JSON category sync...');
      
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

      // Dedupe categories by ID
      const byId = new Map();
      for (const cat of allCategories) {
        const idNum = parseInt(cat.id, 10);
        if (!byId.has(idNum)) byId.set(idNum, cat);
      }
      const uniqueCategories = Array.from(byId.values());

      // SINGLE DATABASE OPERATION - This is the magic!
      const startTime = Date.now();
      const { data: syncResult, error: syncError } = await supabaseService.adminClient
        .rpc('sync_categories_from_api_optimized', {
          api_categories_json: uniqueCategories
        });

      const syncDuration = Date.now() - startTime;

      if (syncError) {
        console.error('Error calling single JSON sync function:', syncError);
        return res.status(500).json({
          success: false,
          message: 'Failed to sync categories',
          error: syncError.message
        });
      }

      console.log(`ULTRA-FAST sync completed in ${syncDuration}ms!`);
      console.log('Sync result:', syncResult);

      res.json({
        success: true,
        data: {
          old_count: syncResult.old_count,
          new_count: syncResult.new_count,
          total: syncResult.new_count,
          sync_duration_ms: syncDuration,
          performance_improvement: 'Single operation vs thousands of UPSERTs'
        },
        message: `Categories synced successfully in ${syncDuration}ms using single JSON operation`
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
   * Get all categories (from single JSON row with admin customizations)
   */
  async getCategories(req, res) {
    try {
      // Get processed categories (with admin customizations applied)
      const { data: processedCategories, error } = await supabaseService.adminClient
        .rpc('get_processed_categories');

      if (error) {
        console.error('Error fetching processed categories:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch categories',
          error: error.message
        });
      }

      // Also get metadata
      const { data: categoryRow } = await supabaseService.adminClient
        .from('categories')
        .select(`
          total_categories_count,
          total_events_count,
          category_view_counts,
          featured_categories,
          hidden_categories,
          last_sync_at,
          last_updated_at
        `)
        .eq('id', 1)
        .single();

      // Transform for backward compatibility and add metadata
      const categories = Array.isArray(processedCategories) ? processedCategories : [];
      
      // Add metadata to each category
      const enrichedCategories = categories.map(cat => {
        const catId = cat.id?.toString();
        const viewCount = categoryRow?.category_view_counts?.[catId] || 0;
        const isFeatured = categoryRow?.featured_categories?.includes(catId) || false;
        const isHidden = categoryRow?.hidden_categories?.includes(catId) || false;
        
        return {
          id: parseInt(cat.id),
          name: cat.display_name || cat.name,
          slug: cat.slug || this.generateSlug(cat.display_name || cat.name, cat.id),
          parent_id: cat.parent ? parseInt(cat.parent.id) : null,
          is_visible: !isHidden,
          is_featured: isFeatured,
          view_count: viewCount,
          api_data: cat, // Original data for compatibility
          source_data: cat,
          processed_data: cat.customizations || null,
          sync_at: categoryRow?.last_sync_at,
          updated_at: categoryRow?.last_updated_at
        };
      });

      res.json({
        success: true,
        data: enrichedCategories,
        metadata: {
          total_count: categoryRow?.total_categories_count || 0,
          total_events: categoryRow?.total_events_count || 0,
          featured_count: categoryRow?.featured_categories?.length || 0,
          hidden_count: categoryRow?.hidden_categories?.length || 0,
          last_sync: categoryRow?.last_sync_at,
          storage_type: 'single_json_row'
        }
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

  generateSlug(name, id) {
        if (!name) return `category-${id}`;
        return name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .replace(/\s+/g, '-')
          .trim();
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
      // Single-row JSON approach: manage visibility via hidden_categories array
      const categoryIdStr = String(id);

      // Read current hidden list
      const { data: categoriesRow, error: readError } = await supabaseService.adminClient
        .from('categories')
        .select('hidden_categories')
        .eq('id', 1)
        .single();

      if (readError) {
        console.error('Error reading hidden_categories:', readError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category visibility',
          error: readError.message
        });
      }

      const currentHidden = Array.isArray(categoriesRow?.hidden_categories)
        ? categoriesRow.hidden_categories.map((v) => String(v))
        : [];

      let nextHidden;
      if (is_visible) {
        // Remove from hidden list
        nextHidden = currentHidden.filter((v) => v !== categoryIdStr);
      } else {
        // Add to hidden list if not present
        const set = new Set(currentHidden);
        set.add(categoryIdStr);
        nextHidden = Array.from(set);
      }

      const { error: updateError } = await supabaseService.adminClient
        .from('categories')
        .update({ hidden_categories: nextHidden })
        .eq('id', 1);

      if (updateError) {
        console.error('Error writing hidden_categories:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category visibility',
          error: updateError.message
        });
      }

      res.json({
        success: true,
        data: { id: categoryIdStr, is_visible },
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

  /**
   * Update category processed data (admin customizations for single JSON row)
   */
  async updateCategoryProcessedData(req, res) {
    try {
      const { id } = req.params;
      const { processed_data } = req.body;

      if (!processed_data || typeof processed_data !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'processed_data must be a valid object',
          code: 'INVALID_PROCESSED_DATA'
        });
      }

      const { data: success, error } = await supabaseService.adminClient
        .rpc('update_category_processed_data', {
          category_id: id.toString(),
          new_processed_data: JSON.stringify(processed_data)
        });

      if (error) {
        console.error('Error updating category processed data:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category processed data',
          error: error.message
        });
      }

      res.json({
        success: true,
        message: 'Category processed data updated successfully',
        data: { category_id: id, processed_data },
        performance_note: 'Single JSON update operation'
      });
    } catch (error) {
      console.error('Error in updateCategoryProcessedData:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update category processed data',
        error: error.message
      });
    }
  }

  /**
   * Update category settings (admin controls)
   */
  async updateCategorySettings(req, res) {
    try {
      const { id } = req.params;
      const { is_visible, is_featured, admin_priority } = req.body;

      // Single-row JSON approach: manage visibility/featured via arrays
      if (typeof is_visible !== 'boolean' && typeof is_featured !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update (is_visible or is_featured)',
          code: 'NO_UPDATE_FIELDS'
        });
      }

      const categoryIdStr = String(id);
      // Read current featured/hidden lists
      const { data: categoriesRow, error: readError } = await supabaseService.adminClient
        .from('categories')
        .select('hidden_categories, featured_categories')
        .eq('id', 1)
        .single();

      if (readError) {
        console.error('Error reading category settings arrays:', readError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category settings',
          error: readError.message
        });
      }

      let nextHidden = Array.isArray(categoriesRow?.hidden_categories)
        ? categoriesRow.hidden_categories.map((v) => String(v))
        : [];
      let nextFeatured = Array.isArray(categoriesRow?.featured_categories)
        ? categoriesRow.featured_categories.map((v) => String(v))
        : [];

      if (typeof is_visible === 'boolean') {
        if (is_visible) {
          nextHidden = nextHidden.filter((v) => v !== categoryIdStr);
        } else {
          const s = new Set(nextHidden); s.add(categoryIdStr); nextHidden = Array.from(s);
        }
      }

      if (typeof is_featured === 'boolean') {
        if (is_featured) {
          const s = new Set(nextFeatured); s.add(categoryIdStr); nextFeatured = Array.from(s);
        } else {
          nextFeatured = nextFeatured.filter((v) => v !== categoryIdStr);
        }
      }

      const { error: updateError } = await supabaseService.adminClient
        .from('categories')
        .update({ hidden_categories: nextHidden, featured_categories: nextFeatured })
        .eq('id', 1);

      if (updateError) {
        console.error('Error writing category settings arrays:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category settings',
          error: updateError.message
        });
      }

      res.json({
        success: true,
        data: { id: categoryIdStr, is_visible, is_featured },
        message: 'Category settings updated successfully'
      });
    } catch (error) {
      console.error('Error in updateCategorySettings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update category settings',
        error: error.message
      });
    }
  }

  /**
   * Toggle featured flag for a category (compat endpoint)
   * Body: { is_featured: boolean }
   */
  async updateCategoryFeatured(req, res) {
    try {
      const { id } = req.params;
      const { is_featured } = req.body;

      if (typeof is_featured !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'is_featured must be a boolean',
          code: 'INVALID_FEATURED'
        });
      }

      const categoryIdStr = String(id);
      const { data: categoriesRow, error: readError } = await supabaseService.adminClient
        .from('categories')
        .select('featured_categories')
        .eq('id', 1)
        .single();

      if (readError) {
        console.error('Error reading featured_categories:', readError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category featured flag',
          error: readError.message
        });
      }

      let nextFeatured = Array.isArray(categoriesRow?.featured_categories)
        ? categoriesRow.featured_categories.map((v) => String(v))
        : [];

      if (is_featured) {
        const s = new Set(nextFeatured); s.add(categoryIdStr); nextFeatured = Array.from(s);
      } else {
        nextFeatured = nextFeatured.filter((v) => v !== categoryIdStr);
      }

      const { error: updateError } = await supabaseService.adminClient
        .from('categories')
        .update({ featured_categories: nextFeatured })
        .eq('id', 1);

      if (updateError) {
        console.error('Error writing featured_categories:', updateError);
        return res.status(500).json({
          success: false,
          message: 'Failed to update category featured flag',
          error: updateError.message
        });
      }

      res.json({
        success: true,
        data: { id: categoryIdStr, is_featured },
        message: 'Category featured flag updated successfully'
      });
    } catch (error) {
      console.error('Error in updateCategoryFeatured:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update category featured flag',
          error: error.message
        });
    }
  }

  /**
   * Get category analytics
   */
  async getCategoryAnalytics(req, res) {
    try {
      const { data: analytics, error } = await supabaseService.adminClient
        .from('categories')
        .select(`
          id,
          display_name,
          is_visible,
          is_featured,
          total_events_count,
          viewed_count,
          admin_priority,
          last_sync_at
        `)
        .order('viewed_count', { ascending: false });

      if (error) {
        console.error('Error fetching category analytics:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch category analytics',
          error: error.message
        });
      }

      // Calculate summary stats
      const totalCategories = analytics.length;
      const visibleCategories = analytics.filter(cat => cat.is_visible).length;
      const featuredCategories = analytics.filter(cat => cat.is_featured).length;
      const totalViews = analytics.reduce((sum, cat) => sum + (cat.viewed_count || 0), 0);
      const totalEvents = analytics.reduce((sum, cat) => sum + (cat.total_events_count || 0), 0);

      res.json({
        success: true,
        data: {
          summary: {
            total_categories: totalCategories,
            visible_categories: visibleCategories,
            featured_categories: featuredCategories,
            total_views: totalViews,
            total_events: totalEvents
          },
          categories: analytics
        }
      });
    } catch (error) {
      console.error('Error in getCategoryAnalytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch category analytics',
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
      // Get homepage categories without join (since categories is now single JSON row)
      const { data: homepageCategories, error } = await supabaseService.adminClient
        .from('homepage_categories')
        .select(`
          id,
          category_id,
          display_order,
          is_active,
          created_at
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

      // Get all categories from single JSON row to enrich the data
      const { data: allCategories } = await supabaseService.adminClient
        .rpc('get_processed_categories');

      // Create a map for quick category lookup
      const categoryMap = new Map();
      if (Array.isArray(allCategories)) {
        allCategories.forEach(cat => {
          categoryMap.set(cat.id?.toString(), {
            id: parseInt(cat.id),
            name: cat.display_name || cat.name,
            slug: cat.slug || this.generateSlug(cat.display_name || cat.name, cat.id)
          });
        });
      }

      // Enrich homepage categories with category data
      const enrichedCategories = homepageCategories.map(hc => {
        const key = (hc.category_id ?? '').toString();
        let cat = categoryMap.get(key);
        if (!cat && Array.isArray(allCategories)) {
          const found = allCategories.find(c => (c?.id)?.toString() === key);
          if (found) {
            cat = {
              id: parseInt(found.id),
              name: found.display_name || found.name,
              slug: found.slug || this.generateSlug(found.display_name || found.name, found.id)
            };
          }
        }
        return {
          id: hc.id,
          display_order: hc.display_order,
          is_active: hc.is_active,
          created_at: hc.created_at,
          categories: cat || {
            id: parseInt(key) || key,
            name: `Category ${key}`,
            slug: `category-${key}`
          }
        };
      });

      res.json({
        success: true,
        data: enrichedCategories
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
      // Get homepage categories without join (since categories is now single JSON row)
      const { data: homepageCategories, error } = await supabaseService.anonClient
        .from('homepage_categories')
        .select(`
          id,
          category_id,
          display_order,
          is_active,
          created_at
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

      // Get all categories from single JSON row to enrich the data
      const { data: allCategories } = await supabaseService.anonClient
        .rpc('get_processed_categories');

      // Create a map for quick category lookup
      const categoryMap = new Map();
      if (Array.isArray(allCategories)) {
        allCategories.forEach(cat => {
          categoryMap.set(cat.id?.toString(), {
            id: parseInt(cat.id),
            name: cat.display_name || cat.name,
            slug: cat.slug || this.generateSlug(cat.display_name || cat.name, cat.id)
          });
        });
      }

      // Enrich homepage categories with category data
      const enrichedCategories = homepageCategories.map(hc => {
        const key = (hc.category_id ?? '').toString();
        let cat = categoryMap.get(key);
        if (!cat && Array.isArray(allCategories)) {
          const found = allCategories.find(c => (c?.id)?.toString() === key);
          if (found) {
            cat = {
              id: parseInt(found.id),
              name: found.display_name || found.name,
              slug: found.slug || this.generateSlug(found.display_name || found.name, found.id)
            };
          }
        }
        return {
          id: hc.id,
          display_order: hc.display_order,
          is_active: hc.is_active,
          created_at: hc.created_at,
          categories: cat || {
            id: parseInt(key) || key,
            name: `Category ${key}`,
            slug: `category-${key}`
          }
        };
      });

      res.json({
        success: true,
        data: enrichedCategories
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
   * Set homepage categories - Delete all and restore latest version
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

      // Step 1: Delete ALL existing homepage categories (complete cleanup)
      const { error: deleteError } = await supabaseService.adminClient
        .from('homepage_categories')
        .delete()
        .not('id', 'is', null); // Delete all records (avoid UUID cast issues)

      if (deleteError) {
        console.error('Error deleting existing homepage categories:', deleteError);
        return res.status(500).json({
          success: false,
          message: 'Failed to clear existing homepage categories',
          error: deleteError.message
        });
      }

      // Step 2: Insert new homepage categories (fresh start)
      const insertData = category_ids.map((categoryId, index) => ({
        category_id: String(categoryId),
        display_order: index + 1,
        is_active: true,
        created_by: req.userId
      }));

      const { data, error: insertError } = await supabaseService.adminClient
        .from('homepage_categories')
        .insert(insertData)
        .select(`
          id,
          category_id,
          display_order,
          is_active,
          created_at
        `);

      if (insertError) {
        console.error('Error inserting new homepage categories:', insertError);
        return res.status(500).json({
          success: false,
          message: 'Failed to insert new homepage categories',
          error: insertError.message
        });
      }

      // Step 3: Enrich with category details from single JSON row
      const { data: allCategories } = await supabaseService.adminClient
        .rpc('get_processed_categories');

      const categoryMap = new Map();
      if (Array.isArray(allCategories)) {
        allCategories.forEach(cat => {
          categoryMap.set(cat.id?.toString(), {
            id: parseInt(cat.id),
            name: cat.display_name || cat.name,
            slug: cat.slug || this.generateSlug(cat.display_name || cat.name, cat.id)
          });
        });
      }

      const enriched = (data || []).map(hc => {
        const key = (hc.category_id ?? '').toString();
        let cat = categoryMap.get(key);
        if (!cat && Array.isArray(allCategories)) {
          const found = allCategories.find(c => (c?.id)?.toString() === key);
          if (found) {
            cat = {
              id: parseInt(found.id),
              name: found.display_name || found.name,
              slug: found.slug || this.generateSlug(found.display_name || found.name, found.id)
            };
          }
        }
        return {
          id: hc.id,
          display_order: hc.display_order,
          is_active: hc.is_active,
          created_at: hc.created_at,
          categories: cat || {
            id: parseInt(key) || key,
            name: `Category ${key}`,
            slug: `category-${key}`
          }
        };
      });

      res.json({
        success: true,
        data: enriched,
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
