// Mock data service for development and free tier usage
class MockDataService {
  constructor() {
    this.events = this.generateMockEvents();
    this.categories = this.generateMockCategories();
    this.performers = this.generateMockPerformers();
    this.venues = this.generateMockVenues();
  }

  generateMockEvents() {
    return [
      {
        id: 1,
        name: "Taylor Swift - The Eras Tour",
        venue: {
          id: 1,
          name: "Madison Square Garden",
          city: "New York",
          state: "NY",
          capacity: 20789
        },
        performer: {
          id: 1,
          name: "Taylor Swift"
        },
        category: {
          id: 1,
          name: "Concerts"
        },
        event_date: "2024-06-15T20:00:00Z",
        ticket_count: 150,
        min_price: 150.00,
        max_price: 1200.00,
        image_url: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400"
      },
      {
        id: 2,
        name: "Lakers vs Warriors",
        venue: {
          id: 2,
          name: "Crypto.com Arena",
          city: "Los Angeles",
          state: "CA",
          capacity: 19068
        },
        performer: {
          id: 2,
          name: "Los Angeles Lakers"
        },
        category: {
          id: 2,
          name: "Sports"
        },
        event_date: "2024-07-20T19:30:00Z",
        ticket_count: 200,
        min_price: 85.00,
        max_price: 2500.00,
        image_url: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400"
      },
      {
        id: 3,
        name: "Hamilton - Broadway",
        venue: {
          id: 3,
          name: "Richard Rodgers Theatre",
          city: "New York",
          state: "NY",
          capacity: 1319
        },
        performer: {
          id: 3,
          name: "Hamilton Cast"
        },
        category: {
          id: 3,
          name: "Theater"
        },
        event_date: "2024-08-10T19:00:00Z",
        ticket_count: 50,
        min_price: 200.00,
        max_price: 800.00,
        image_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"
      },
      {
        id: 4,
        name: "Ed Sheeran - Mathematics Tour",
        venue: {
          id: 4,
          name: "Wembley Stadium",
          city: "London",
          state: "UK",
          capacity: 90000
        },
        performer: {
          id: 4,
          name: "Ed Sheeran"
        },
        category: {
          id: 1,
          name: "Concerts"
        },
        event_date: "2024-09-05T18:30:00Z",
        ticket_count: 300,
        min_price: 75.00,
        max_price: 500.00,
        image_url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400"
      },
      {
        id: 5,
        name: "Yankees vs Red Sox",
        venue: {
          id: 5,
          name: "Yankee Stadium",
          city: "New York",
          state: "NY",
          capacity: 47309
        },
        performer: {
          id: 5,
          name: "New York Yankees"
        },
        category: {
          id: 2,
          name: "Sports"
        },
        event_date: "2024-07-25T19:05:00Z",
        ticket_count: 180,
        min_price: 45.00,
        max_price: 1200.00,
        image_url: "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400"
      }
    ];
  }

  generateMockCategories() {
    return [
      { id: 1, name: "Concerts", slug: "concerts" },
      { id: 2, name: "Sports", slug: "sports" },
      { id: 3, name: "Theater", slug: "theater" },
      { id: 4, name: "Comedy", slug: "comedy" },
      { id: 5, name: "Family", slug: "family" }
    ];
  }

  generateMockPerformers() {
    return [
      { id: 1, name: "Taylor Swift", category: "Music" },
      { id: 2, name: "Los Angeles Lakers", category: "Sports" },
      { id: 3, name: "Hamilton Cast", category: "Theater" },
      { id: 4, name: "Ed Sheeran", category: "Music" },
      { id: 5, name: "New York Yankees", category: "Sports" }
    ];
  }

  generateMockVenues() {
    return [
      { id: 1, name: "Madison Square Garden", city: "New York", state: "NY" },
      { id: 2, name: "Crypto.com Arena", city: "Los Angeles", state: "CA" },
      { id: 3, name: "Richard Rodgers Theatre", city: "New York", state: "NY" },
      { id: 4, name: "Wembley Stadium", city: "London", state: "UK" },
      { id: 5, name: "Yankee Stadium", city: "New York", state: "NY" }
    ];
  }

  // Get events with filtering and pagination
  getEvents(filters = {}, page = 1, limit = 20) {
    let filteredEvents = [...this.events];

    // Apply filters
    if (filters['category.id']) {
      filteredEvents = filteredEvents.filter(event => 
        event.category.id === parseInt(filters['category.id'])
      );
    }

    if (filters['venue.city']) {
      filteredEvents = filteredEvents.filter(event => 
        event.venue.city.toLowerCase().includes(filters['venue.city'].toLowerCase())
      );
    }

    if (filters['venue.state']) {
      filteredEvents = filteredEvents.filter(event => 
        event.venue.state.toLowerCase().includes(filters['venue.state'].toLowerCase())
      );
    }

    if (filters.q) {
      const query = filters.q.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.name.toLowerCase().includes(query) ||
        event.performer.name.toLowerCase().includes(query) ||
        event.venue.name.toLowerCase().includes(query)
      );
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

    return {
      events: paginatedEvents,
      pagination: {
        current_page: page,
        per_page: limit,
        total_entries: filteredEvents.length,
        total_pages: Math.ceil(filteredEvents.length / limit),
      },
    };
  }

  getEvent(eventId) {
    return this.events.find(event => event.id === parseInt(eventId));
  }

  getEventsByCategory(categoryId, page = 1, limit = 20) {
    return this.getEvents({ 'category.id': categoryId }, page, limit);
  }

  searchEvents(query, page = 1, limit = 20) {
    return this.getEvents({ q: query }, page, limit);
  }

  getEventsByLocation(city, state, page = 1, limit = 20) {
    const filters = {};
    if (city) filters['venue.city'] = city;
    if (state) filters['venue.state'] = state;
    return this.getEvents(filters, page, limit);
  }

  getEventTickets(eventId, page = 1, limit = 20) {
    const event = this.getEvent(eventId);
    if (!event) return { tickets: [], pagination: { current_page: 1, per_page: limit, total_entries: 0, total_pages: 0 } };

    // Generate mock tickets
    const tickets = Array.from({ length: event.ticket_count }, (_, i) => ({
      id: i + 1,
      event_id: eventId,
      section: `Section ${String.fromCharCode(65 + (i % 10))}`,
      row: Math.floor(i / 10) + 1,
      seat: (i % 10) + 1,
      price: event.min_price + (Math.random() * (event.max_price - event.min_price)),
      quantity: Math.floor(Math.random() * 4) + 1,
      notes: i % 3 === 0 ? "Great seats!" : null
    }));

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTickets = tickets.slice(startIndex, endIndex);

    return {
      tickets: paginatedTickets,
      pagination: {
        current_page: page,
        per_page: limit,
        total_entries: tickets.length,
        total_pages: Math.ceil(tickets.length / limit),
      },
    };
  }

  getCategories() {
    return this.categories;
  }

  getPerformers(page = 1, limit = 20) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPerformers = this.performers.slice(startIndex, endIndex);

    return {
      performers: paginatedPerformers,
      pagination: {
        current_page: page,
        per_page: limit,
        total_entries: this.performers.length,
        total_pages: Math.ceil(this.performers.length / limit),
      },
    };
  }

  getVenues(page = 1, limit = 20) {
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedVenues = this.venues.slice(startIndex, endIndex);

    return {
      venues: paginatedVenues,
      pagination: {
        current_page: page,
        per_page: limit,
        total_entries: this.venues.length,
        total_pages: Math.ceil(this.venues.length / limit),
      },
    };
  }

  healthCheck() {
    return {
      status: 'healthy',
      statusCode: 200,
      message: 'Mock data service is running',
      mode: 'mock'
    };
  }
}

module.exports = new MockDataService();
