# TixPort Backend API

Backend API for TixPort ticket marketplace, built with Node.js, Express, and TicketEvolution API integration.

## Features

- **TicketEvolution API Integration**: Full integration with TicketEvolution v9 API
- **RESTful API**: Clean REST endpoints for events, tickets, and categories
- **Rate Limiting**: Built-in rate limiting for API protection
- **Error Handling**: Comprehensive error handling and logging
- **CORS Support**: Configured for frontend integration
- **Security**: Helmet.js security headers and input validation

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm 9+
- TicketEvolution API token (get from [TicketEvolution](https://ticketevolution.com/))

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   PORT=3001
   NODE_ENV=development
   TICKET_EVOLUTION_API_TOKEN=your_api_token_here
   TICKET_EVOLUTION_API_URL=https://api.ticketevolution.com/v9
   FRONTEND_URL=http://localhost:3000
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Verify the server is running:**
   Open http://localhost:3001/health

## API Endpoints

### Events
- `GET /api/events` - Get all events with optional filtering
- `GET /api/events/:id` - Get single event by ID
- `GET /api/events/category/:categoryId` - Get events by category
- `GET /api/events/search?q=query` - Search events
- `GET /api/events/location?city=City&state=State` - Get events by location

### Tickets
- `GET /api/tickets/event/:eventId` - Get tickets for an event
- `GET /api/tickets/:id` - Get ticket details

### Categories
- `GET /api/categories` - Get all categories
- `GET /api/categories/popular` - Get popular categories

### Query Parameters

**Events filtering:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)
- `category` - Filter by category name
- `city` - Filter by city
- `state` - Filter by state
- `search` - Search query
- `dateFrom` - Start date (YYYY-MM-DD)
- `dateTo` - End date (YYYY-MM-DD)
- `minPrice` - Minimum ticket price
- `maxPrice` - Maximum ticket price

**Example:**
```
GET /api/events?city=New York&category=concerts&minPrice=50&page=1&limit=10
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment | development |
| `TICKET_EVOLUTION_API_TOKEN` | TicketEvolution API token | required |
| `TICKET_EVOLUTION_API_URL` | TicketEvolution API base URL | https://api.ticketevolution.com/v9 |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Error Handling

The API returns consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## Rate Limiting

- General API: 100 requests per 15 minutes
- Search endpoints: 30 requests per minute
- Authentication: 5 requests per 15 minutes

## Development

### Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── routes/          # API routes
├── services/        # Business logic and external API integration
├── utils/           # Utility functions
└── server.js        # Main server file
```

### Adding New Endpoints

1. Create controller in `src/controllers/`
2. Add routes in `src/routes/`
3. Register routes in `src/routes/index.js`

## Production Deployment

1. Set `NODE_ENV=production`
2. Use process manager like PM2
3. Set up reverse proxy (nginx)
4. Configure SSL certificates
5. Set up monitoring and logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

