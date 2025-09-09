const coordinateResolver = require('../coordinateResolver');

// Mock geoip-lite to avoid external dependencies in tests
jest.mock('geoip-lite', () => ({
  lookup: jest.fn()
}));

const geoip = require('geoip-lite');

describe('CoordinateResolver', () => {
  let mockLookup;

  beforeEach(() => {
    mockLookup = geoip.lookup;
    jest.clearAllMocks();
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateCoordinates', () => {
    test('should validate correct coordinates', () => {
      const result = coordinateResolver.validateCoordinates(40.7128, -74.0060); // NYC
      expect(result).toEqual({
        lat: 40.7128,
        lon: -74.0060
      });
    });

    test('should reject coordinates outside valid ranges', () => {
      expect(coordinateResolver.validateCoordinates(91, 0)).toBeNull(); // lat > 90
      expect(coordinateResolver.validateCoordinates(-91, 0)).toBeNull(); // lat < -90
      expect(coordinateResolver.validateCoordinates(0, 181)).toBeNull(); // lon > 180
      expect(coordinateResolver.validateCoordinates(0, -181)).toBeNull(); // lon < -180
    });

    test('should reject non-numeric coordinates', () => {
      expect(coordinateResolver.validateCoordinates('invalid', 0)).toBeNull();
      expect(coordinateResolver.validateCoordinates(0, 'invalid')).toBeNull();
      expect(coordinateResolver.validateCoordinates(null, 0)).toBeNull();
      expect(coordinateResolver.validateCoordinates(0, undefined)).toBeNull();
    });

    test('should handle string numbers', () => {
      const result = coordinateResolver.validateCoordinates('40.7128', '-74.0060');
      expect(result).toEqual({
        lat: 40.7128,
        lon: -74.0060
      });
    });
  });

  describe('resolveCoordinates', () => {
    test('should prioritize browser coordinates when available', async () => {
      const input = {
        lat: 40.7128,
        lon: -74.0060,
        ip: '8.8.8.8',
        requestId: 'test-123'
      };

      const result = await coordinateResolver.resolveCoordinates(input);

      expect(result).toEqual({
        lat: 40.7128,
        lon: -74.0060,
        source: 'browser',
        accuracy: 'high'
      });

      // Should not call GeoIP when browser coords are available
      expect(mockLookup).not.toHaveBeenCalled();
    });

    test('should fall back to IP geolocation when browser coords unavailable', async () => {
      mockLookup.mockReturnValue({
        ll: [37.7749, -122.4194], // San Francisco
        city: 'San Francisco',
        region: 'CA',
        country: 'US',
        timezone: 'America/Los_Angeles'
      });

      const input = {
        ip: '8.8.8.8',
        requestId: 'test-123'
      };

      const result = await coordinateResolver.resolveCoordinates(input);

      expect(result).toEqual({
        lat: 37.7749,
        lon: -122.4194,
        city: 'San Francisco',
        region: 'CA',
        country: 'US',
        timezone: 'America/Los_Angeles',
        source: 'geoip',
        accuracy: 'medium'
      });

      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should return null when no valid coordinates found', async () => {
      mockLookup.mockReturnValue(null); // GeoIP lookup fails

      const input = {
        ip: '8.8.8.8',
        requestId: 'test-123'
      };

      const result = await coordinateResolver.resolveCoordinates(input);

      expect(result).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should handle invalid browser coordinates', async () => {
      mockLookup.mockReturnValue({
        ll: [37.7749, -122.4194],
        city: 'San Francisco',
        region: 'CA',
        country: 'US',
        timezone: 'America/Los_Angeles'
      });

      const input = {
        lat: 200, // Invalid latitude
        lon: -74.0060,
        ip: '8.8.8.8',
        requestId: 'test-123'
      };

      const result = await coordinateResolver.resolveCoordinates(input);

      // Should fall back to IP geolocation
      expect(result.source).toBe('geoip');
      expect(result.lat).toBe(37.7749);
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });
  });

  describe('isValidIP', () => {
    test('should validate IPv4 addresses', () => {
      expect(coordinateResolver.isValidIP('192.168.1.1')).toBe(true);
      expect(coordinateResolver.isValidIP('8.8.8.8')).toBe(true);
      expect(coordinateResolver.isValidIP('255.255.255.255')).toBe(true);
    });

    test('should reject invalid IPv4 addresses', () => {
      expect(coordinateResolver.isValidIP('256.1.1.1')).toBe(false);
      expect(coordinateResolver.isValidIP('192.168.1')).toBe(false);
      expect(coordinateResolver.isValidIP('not-an-ip')).toBe(false);
      expect(coordinateResolver.isValidIP('')).toBe(false);
      expect(coordinateResolver.isValidIP(null)).toBe(false);
    });
  });

  describe('isLocalIP', () => {
    test('should identify local IPs', () => {
      expect(coordinateResolver.isLocalIP('127.0.0.1')).toBe(true);
      expect(coordinateResolver.isLocalIP('localhost')).toBe(true);
      expect(coordinateResolver.isLocalIP('::1')).toBe(true);
      expect(coordinateResolver.isLocalIP('192.168.1.1')).toBe(true);
      expect(coordinateResolver.isLocalIP('10.0.0.1')).toBe(true);
      expect(coordinateResolver.isLocalIP('172.16.0.1')).toBe(true);
    });

    test('should identify public IPs', () => {
      expect(coordinateResolver.isLocalIP('8.8.8.8')).toBe(false);
      expect(coordinateResolver.isLocalIP('208.67.222.222')).toBe(false);
      expect(coordinateResolver.isLocalIP('173.252.85.20')).toBe(false);
    });
  });

  describe('buildTEvoParams', () => {
    test('should include coordinates when available', () => {
      const coordinates = {
        lat: 40.7128,
        lon: -74.0060,
        source: 'browser',
        accuracy: 'high'
      };

      const params = coordinateResolver.buildTEvoParams(coordinates, 25, { category_id: '123' });

      expect(params).toEqual({
        only_with_available_tickets: true,
        category_id: '123',
        lat: 40.7128,
        lon: -74.0060,
        within: 25
      });
    });

    test('should NOT include within parameter when coordinates are missing', () => {
      const params = coordinateResolver.buildTEvoParams(null, 25, { category_id: '123' });

      expect(params).toEqual({
        only_with_available_tickets: true,
        category_id: '123'
      });

      // Critical: No 'within' parameter without coordinates
      expect(params.within).toBeUndefined();
      expect(params.lat).toBeUndefined();
      expect(params.lon).toBeUndefined();
    });

    test('should use default radius of 50 miles', () => {
      const coordinates = {
        lat: 40.7128,
        lon: -74.0060,
        source: 'browser',
        accuracy: 'high'
      };

      const params = coordinateResolver.buildTEvoParams(coordinates);

      expect(params.within).toBe(50);
    });
  });

  describe('getCountryFromIP', () => {
    test('should return country code when available', () => {
      mockLookup.mockReturnValue({
        country: 'US',
        city: 'San Francisco'
      });

      const country = coordinateResolver.getCountryFromIP('8.8.8.8', 'test-123');

      expect(country).toBe('US');
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should return null for local IPs', () => {
      const country = coordinateResolver.getCountryFromIP('127.0.0.1', 'test-123');

      expect(country).toBeNull();
      expect(mockLookup).not.toHaveBeenCalled();
    });

    test('should handle GeoIP lookup failures', () => {
      mockLookup.mockReturnValue(null);

      const country = coordinateResolver.getCountryFromIP('8.8.8.8', 'test-123');

      expect(country).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });
  });

  describe('resolveFromIP', () => {
    test('should skip local IPs', () => {
      const result = coordinateResolver.resolveFromIP('127.0.0.1', 'test-123');

      expect(result).toBeNull();
      expect(mockLookup).not.toHaveBeenCalled();
    });

    test('should return null when GeoIP lookup fails', () => {
      mockLookup.mockReturnValue(null);

      const result = coordinateResolver.resolveFromIP('8.8.8.8', 'test-123');

      expect(result).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should return null when coordinates are invalid', () => {
      mockLookup.mockReturnValue({
        ll: [200, -74.0060], // Invalid latitude
        city: 'Test City'
      });

      const result = coordinateResolver.resolveFromIP('8.8.8.8', 'test-123');

      expect(result).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    test('should handle missing coordinate data', () => {
      mockLookup.mockReturnValue({
        city: 'Test City',
        // No 'll' field
      });

      const result = coordinateResolver.resolveFromIP('8.8.8.8', 'test-123');

      expect(result).toBeNull();
      expect(mockLookup).toHaveBeenCalledWith('8.8.8.8');
    });
  });

  describe('healthCheck', () => {
    test('should return healthy status when GeoIP works', async () => {
      mockLookup.mockReturnValue({
        ll: [37.7749, -122.4194],
        city: 'San Francisco'
      });

      const health = await coordinateResolver.healthCheck();

      expect(health).toEqual({
        status: 'healthy',
        message: 'Coordinate resolver is operational',
        geoipDatabase: 'loaded',
        testLookup: 'success',
        timestamp: expect.any(String)
      });
    });

    test('should return unhealthy status when GeoIP fails', async () => {
      mockLookup.mockImplementation(() => {
        throw new Error('GeoIP database not loaded');
      });

      const health = await coordinateResolver.healthCheck();

      expect(health).toEqual({
        status: 'unhealthy',
        message: 'Coordinate resolver error',
        error: 'GeoIP database not loaded',
        timestamp: expect.any(String)
      });
    });
  });
});
