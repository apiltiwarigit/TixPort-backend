const ticketEvolutionService = require('../services/ticketEvolutionService');
const supabaseService = require('../services/supabaseService');

class CategoriesController {
  // Get all categories (from single JSON row with admin customizations applied)
  async getCategories(req, res) {
    try {
      // Get processed categories from single JSON row
      const { data: processedCategories, error: dbError } = await supabaseService.anonClient
        .rpc('get_processed_categories');

      if (!dbError && Array.isArray(processedCategories) && processedCategories.length > 0) {
        // Get visibility settings
        const { data: categoryRow } = await supabaseService.anonClient
          .from('categories')
          .select('hidden_categories, featured_categories')
          .eq('id', 1)
          .single();

        // Base hidden set from admin settings
        const baseHiddenIds = new Set((categoryRow?.hidden_categories || []).map((v) => String(v)));

        // Build parent lookup for cascade hiding
        const idToParent = new Map();
        processedCategories.forEach((cat) => {
          const id = cat?.id?.toString();
          const parentId = cat?.parent?.id ? String(cat.parent.id) : null;
          if (id) idToParent.set(id, parentId);
        });

        // Determine if a category has a hidden ancestor
        const memo = new Map();
        const hasHiddenAncestor = (id) => {
          if (!id) return false;
          if (memo.has(id)) return memo.get(id);
          if (baseHiddenIds.has(id)) { memo.set(id, true); return true; }
          const parentId = idToParent.get(id);
          const result = parentId ? hasHiddenAncestor(parentId) : false;
          memo.set(id, result);
          return result;
        };

        // Filter out categories that are hidden OR whose ancestor is hidden
        const visibleCategories = processedCategories.filter((cat) => {
          const id = cat?.id?.toString();
          if (!id) return false;
          if (baseHiddenIds.has(id)) return false;
          return !hasHiddenAncestor(id);
        });

        // Build parent map for relationships
        const byId = new Map();
        visibleCategories.forEach((cat) => {
          byId.set(cat.id, { 
            id: cat.id, 
            name: cat.display_name || cat.name, 
            slug: (cat.display_name || cat.name || '')
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .replace(/\s+/g, '-')
              .trim() || `category-${cat.id}`
          });
        });

        // Transform for frontend
        const transformed = visibleCategories.map((cat) => ({
          id: cat.id?.toString(),
          name: cat.display_name || cat.name,
          slug: (cat.display_name || cat.name || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .trim() || `category-${cat.id}`,
          parent: cat.parent && byId.has(cat.parent.id)
            ? {
                id: cat.parent.id?.toString(),
                name: byId.get(cat.parent.id).name,
                slug: byId.get(cat.parent.id).slug,
              }
            : null,
          children: [], // Will be populated by frontend if needed
        }));

        return res.json({ 
          success: true, 
          data: transformed, 
          source: 'single_json_db',
          performance_note: 'Ultra-fast single JSON query'
        });
      }

      // 2) Fallback to API if DB empty/unavailable
      const result = await ticketEvolutionService.getCategories();

      const transformedCategories = result.categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.name
          ? cat.name
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '')
          : `category-${cat.id}`,
        parent: cat.parent
          ? {
              id: cat.parent.id,
              name: cat.parent.name,
              slug: cat.parent.name
                ? cat.parent.name
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^a-z0-9-]/g, '')
                : `category-${cat.parent.id}`,
            }
          : null,
        children: [],
      }));

      return res.json({
        success: true,
        data: transformedCategories,
        pagination: result.pagination,
        source: 'api',
      });
    } catch (error) {
      console.error('Error fetching categories:', error.message);
      res.status(503).json({
        success: false,
        message: 'Unable to fetch categories',
        error: error.message,
        code: 'CATEGORIES_UNAVAILABLE',
      });
    }
  }

  // Get popular/root categories (prefer database)
  async getPopularCategories(req, res) {
    try {
      const { data: dbCategories, error: dbError } = await supabaseService.anonClient
        .from('categories')
        .select('id, display_name, display_slug')
        .is('parent_category_id', null)
        .eq('is_visible', true)
        .order('display_name', { ascending: true })
        .limit(6);

      if (!dbError && Array.isArray(dbCategories) && dbCategories.length > 0) {
        const mainCategories = dbCategories.map((cat) => ({
          id: cat.id.toString(),
          name: cat.display_name,
          slug: cat.display_slug,
          parent: null,
        }));
        return res.json({ success: true, data: mainCategories, source: 'db' });
      }

      // Fallback to API
      const result = await ticketEvolutionService.getCategories();
      const mainCategories = result.categories
        .filter((cat) => !cat.parent)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .slice(0, 6)
        .map((cat) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.name
            ? cat.name
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '')
            : `category-${cat.id}`,
          parent: null,
        }));

      return res.json({ success: true, data: mainCategories, source: 'api' });
    } catch (error) {
      console.error('Error fetching popular categories:', error.message);
      res.status(503).json({
        success: false,
        message: 'Unable to fetch popular categories',
        error: error.message,
        code: 'POPULAR_CATEGORIES_UNAVAILABLE',
      });
    }
  }

  // Get events for a specific category using existing getEvents function
  async getCategoryEvents(req, res) {
    try {
      const { id } = req.params;

      // Handle "all" parameter to show all events without category filter
      if (id === 'all') {
        // Remove any category filtering to get all events
        delete req.query.category_id;
        req.query.only_with_available_tickets = true;
      } else {
        // For specific categories, apply the category filter
        req.query.category_id = id;
        req.query.only_with_available_tickets = true;
        req.query.category_tree = req.query.category_tree || 'false'; // Don't include sub-categories by default
      }

      // Use the existing events controller directly
      const eventsController = require('./eventsController');
      await eventsController.getEvents(req, res);

    } catch (error) {
      console.error('Error fetching category events:', error.message);
      res.status(503).json({
        success: false,
        message: 'Unable to fetch category events',
        error: error.message,
        code: 'API_UNAVAILABLE'
      });
    }
  }

  // Track category view (increment view count in single JSON row)
  async trackCategoryView(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category ID',
          code: 'INVALID_CATEGORY_ID'
        });
      }

      // Use the database function to track view
      const { data: success, error } = await supabaseService.anonClient
        .rpc('increment_category_view_count', {
          category_id: id.toString()
        });

      if (error) {
        console.error('Error tracking category view:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to track category view',
          error: error.message
        });
      }

      res.json({
        success: true,
        message: 'Category view tracked successfully',
        performance_note: 'Single JSON update operation'
      });
    } catch (error) {
      console.error('Error in trackCategoryView:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to track category view',
        error: error.message
      });
    }
  }

  // Helper method for generating slugs
  generateSlug(name, id) {
    if (!name) return `category-${id}`;
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .trim();
  }
}

module.exports = new CategoriesController();

