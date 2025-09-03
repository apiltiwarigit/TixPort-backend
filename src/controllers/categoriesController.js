const ticketEvolutionService = require('../services/ticketEvolutionService');

class CategoriesController {
  // Get all categories
  async getCategories(req, res) {
    try {
      // Get real categories from TicketEvolution API
      const result = await ticketEvolutionService.getCategories();

      // Transform API data to our expected format
      const transformedCategories = result.categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        slug: cat.name ? cat.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : `category-${cat.id}`,
        parent: cat.parent ? {
          id: cat.parent.id,
          name: cat.parent.name,
          slug: cat.parent.name ? cat.parent.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : `category-${cat.parent.id}`
        } : null,
        children: [] // Will be populated by frontend tree building logic
      }));

      res.json({
        success: true,
        data: transformedCategories,
        pagination: result.pagination,
        source: 'api'
      });
    } catch (error) {
      console.error('Error fetching categories from API:', error.message);
      res.status(503).json({
        success: false,
        message: 'Unable to fetch categories from API',
        error: error.message,
        code: 'API_UNAVAILABLE'
      });
    }
  }

  // Get popular categories from real API data
  async getPopularCategories(req, res) {
    try {
      // Get all categories from API
      const result = await ticketEvolutionService.getCategories();

      // Filter and sort to get "popular" categories (first 6 main categories)
      const mainCategories = result.categories
        .filter(cat => !cat.parent) // Only root categories
        .sort((a, b) => (a.name || '').localeCompare(b.name || '')) // Alphabetical
        .slice(0, 6) // Take first 6
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          slug: cat.name ? cat.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : `category-${cat.id}`,
          parent: cat.parent ? {
            id: cat.parent.id,
            name: cat.parent.name,
            slug: cat.parent.name ? cat.parent.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : `category-${cat.parent.id}`
          } : null
        }));

      res.json({
        success: true,
        data: mainCategories,
        source: 'api'
      });
    } catch (error) {
      console.error('Error fetching popular categories from API:', error.message);
      res.status(503).json({
        success: false,
        message: 'Unable to fetch popular categories from API',
        error: error.message,
        code: 'API_UNAVAILABLE'
      });
    }
  }
}

module.exports = new CategoriesController();

