const ticketEvolutionService = require('../services/ticketEvolutionService');

class CategoriesController {
  // Get all categories
  async getCategories(req, res) {
    try {
      const categories = await ticketEvolutionService.getCategories();

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error('Error in getCategories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch categories',
        error: error.message,
      });
    }
  }

  // Get popular categories (predefined list)
  async getPopularCategories(req, res) {
    try {
      // Since TicketEvolution API might not have a specific "popular" endpoint,
      // we'll define popular categories based on common event types
      const popularCategories = [
        { id: 1, name: 'Concerts', slug: 'concerts' },
        { id: 2, name: 'Sports', slug: 'sports' },
        { id: 3, name: 'Theatre', slug: 'theatre' },
        { id: 4, name: 'NFL Football', slug: 'nfl' },
        { id: 5, name: 'MLB Baseball', slug: 'mlb' },
        { id: 6, name: 'NBA Basketball', slug: 'nba' },
        { id: 7, name: 'NHL Hockey', slug: 'nhl' },
        { id: 8, name: 'MLS Soccer', slug: 'mls' },
      ];

      res.json({
        success: true,
        data: popularCategories,
      });
    } catch (error) {
      console.error('Error in getPopularCategories:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch popular categories',
        error: error.message,
      });
    }
  }
}

module.exports = new CategoriesController();
