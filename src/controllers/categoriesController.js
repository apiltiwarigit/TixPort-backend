const ticketEvolutionService = require('../services/ticketEvolutionService');
const supabaseService = require('../services/supabaseService');

class CategoriesController {
  // Get all categories (prefer database, fallback to API)
  async getCategories(req, res) {
    try {
      // 1) Try to fetch from database (public, visible categories)
      const { data: dbCategories, error: dbError } = await supabaseService.anonClient
        .from('categories')
        .select('id, name, slug, parent_id, is_visible')
        .eq('is_visible', true)
        .order('name', { ascending: true });

      if (!dbError && Array.isArray(dbCategories) && dbCategories.length > 0) {
        // Build parent map to include parent details
        const byId = new Map();
        dbCategories.forEach((row) => {
          byId.set(row.id, { id: row.id, name: row.name, slug: row.slug });
        });

        const transformed = dbCategories.map((row) => ({
          id: row.id.toString(),
          name: row.name,
          slug: row.slug,
          parent: row.parent_id && byId.has(row.parent_id)
            ? {
                id: byId.get(row.parent_id).id.toString(),
                name: byId.get(row.parent_id).name,
                slug: byId.get(row.parent_id).slug,
              }
            : null,
          children: [],
        }));

        return res.json({ success: true, data: transformed, source: 'db' });
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
        .select('id, name, slug')
        .is('parent_id', null)
        .eq('is_visible', true)
        .order('name', { ascending: true })
        .limit(6);

      if (!dbError && Array.isArray(dbCategories) && dbCategories.length > 0) {
        const mainCategories = dbCategories.map((cat) => ({
          id: cat.id.toString(),
          name: cat.name,
          slug: cat.slug,
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
}

module.exports = new CategoriesController();

