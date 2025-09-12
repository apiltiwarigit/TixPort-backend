# TixPort Environment Configuration

## Required Environment Variables

Create a `.env` file in the backend directory with the following variables:

### TEvo v9/Braintree Configuration

```bash
# Ticket Evolution API Configuration (v9/Braintree)
TEVO_API_HOST=api.sandbox.ticketevolution.com
TICKET_EVOLUTION_API_TOKEN=your_api_token_here
TICKET_EVOLUTION_API_SECRET=your_api_secret_here
TEVO_OFFICE_ID=8271
TICKET_EVOLUTION_ENV=sandbox
```

### Server Configuration

```bash
# Server Configuration
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Database & Authentication

```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/tixport

# JWT Configuration
JWT_SECRET=your_jwt_secret_here_change_in_production
JWT_EXPIRE=7d
```

### Optional Configuration

```bash
# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Riskified (Fraud Protection)
NEXT_PUBLIC_STORE_DOMAIN=tixport.com
```

## Production Environment

For production, update these variables:

```bash
TICKET_EVOLUTION_ENV=production
TEVO_API_HOST=api.ticketevolution.com
NODE_ENV=production
PORT=80
```

## Migration from v10/Stripe

The following environment variables are **NO LONGER NEEDED** after the v9/Braintree migration:

- `TICKET_EVOLUTION_V10_API_URL` (removed)
- Stripe keys are no longer needed (Braintree tokens obtained via TEvo API)

## New in v9/Braintree

- `TEVO_OFFICE_ID`: Your office/seller ID (required for order creation)
- `TEVO_API_HOST`: Hostname for TEvo API (allows sandbox/production switching)
- Payment processing now uses Braintree client tokens obtained from TEvo API
- No direct Stripe configuration needed

## Testing the Configuration

Run the test script to verify your environment setup:

```bash
cd TixPort-backend
node test-checkout.js
```
