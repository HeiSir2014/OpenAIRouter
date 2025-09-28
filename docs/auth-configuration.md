# Authentication Configuration

## Overview

The OpenAIRouter supports configurable authentication for local development. You can disable authentication entirely for testing purposes by setting the `DISABLE_AUTH` environment variable.

## Configuration

### Environment Variables

Add the following to your `.env` file:

```bash
# Authentication Configuration
# Set to true to disable authentication for local development
DISABLE_AUTH=false
```

### Values

- `DISABLE_AUTH=false` (default): Authentication is required for all chat endpoints
- `DISABLE_AUTH=true`: Authentication is disabled, all chat requests are accepted without token validation

## Usage

### Development Mode

For local development and testing, you can disable authentication:

```bash
# In your .env file
DISABLE_AUTH=true
```

This will allow you to make requests to chat endpoints without providing an API key:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Production Mode

For production deployments, always keep authentication enabled:

```bash
# In your .env file
DISABLE_AUTH=false
```

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never disable authentication in production environments**
2. **Only use `DISABLE_AUTH=true` for local development and testing**
3. **The authentication bypass logs all requests for security auditing**
4. **Rate limiting and other security measures remain active even when authentication is disabled**

## Implementation Details

When `DISABLE_AUTH=true`:

- The `conditionalAuthMiddleware` skips token validation
- All chat endpoints become accessible without authentication
- Request logging continues for security auditing
- Rate limiting and other middleware remain active
- The system logs authentication bypass events

## Example Configuration Files

### .env.example
```bash
# Environment Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
DB_PATH=./database/app.db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long
JWT_EXPIRES_IN=7d

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Rate Limiting Configuration
DEFAULT_RATE_LIMIT_RPM=60
DEFAULT_RATE_LIMIT_TPM=10000
RATE_LIMIT_WINDOW_MS=60000

# Authentication Configuration
# Set to true to disable authentication for local development
DISABLE_AUTH=false

# Provider API Keys (Optional - for testing with real providers)
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### .env (for local development)
```bash
# Copy from .env.example and modify as needed
DISABLE_AUTH=true
JWT_SECRET=your-local-development-secret-key
```
