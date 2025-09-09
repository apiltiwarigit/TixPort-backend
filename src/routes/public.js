const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const coordinateResolver = require('../services/coordinateResolver');

// ===========================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// ===========================

// Get active hero sections for public display
router.get('/hero-sections', adminController.getActiveHeroSections);

// Get homepage categories for public display (active only)
router.get('/homepage-categories', adminController.getPublicHomepageCategories);

// Get public config settings
router.get('/config', adminController.getPublicConfig);

// Coordinate resolution demo endpoint
router.get('/location-demo', async (req, res) => {
  try {
    const { lat, lon, ip } = req.query;
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const requestId = Math.random().toString(36).substring(7);

    // Resolve coordinates
    const coordinates = await coordinateResolver.resolveCoordinates({
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      ip: ip === 'auto' ? clientIP : ip,
      requestId
    });

    // Build sample TEvo parameters
    const tevoParams = coordinateResolver.buildTEvoParams(coordinates, 50, {
      only_with_available_tickets: true,
      category_id: 'test'
    });

    // Get country as fallback
    const country = coordinates ? null : coordinateResolver.getCountryFromIP(ip === 'auto' ? clientIP : ip, requestId);

    res.json({
      success: true,
      data: {
        input: {
          lat: lat || null,
          lon: lon || null,
          ip: ip || null,
          clientIP: clientIP || null
        },
        resolvedCoordinates: coordinates,
        tevoParameters: tevoParams,
        fallbackCountry: country,
        explanation: {
          coordinateSource: coordinates?.source || 'none',
          willSendWithin: !!coordinates,
          safeForTEvo: !tevoParams.within || (tevoParams.lat && tevoParams.lon)
        },
        requestId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Location demo failed',
      error: error.message
    });
  }
});

module.exports = router;
