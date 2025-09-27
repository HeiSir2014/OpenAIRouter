# OpenAI Router

A high-performance OpenAI API compatible router server with multi-provider support, built with Node.js, Express, and TypeScript. Features OpenRouter integration with free DeepSeek Chat v3.1 model as default provider.

## Features

- 🆓 **Free AI Access**: Default integration with DeepSeek Chat v3.1 free model via OpenRouter
- 🔄 **Multi-Provider Support**: Route requests to OpenAI, Anthropic, DeepSeek, and other AI providers
- 🔐 **Authentication & Authorization**: Secure API key management and user authentication
- 📊 **Usage Tracking**: Comprehensive logging and usage statistics
- 🛠️ **Function Calling**: Full support for OpenAI function calling with transparent passthrough
- ⚡ **High Performance**: Optimized for low latency and high throughput
- 🔧 **Easy Configuration**: Simple setup with environment variables
- 📈 **Scalable Architecture**: Designed for horizontal scaling
- 🌐 **ES Modules**: Modern JavaScript modules with TypeScript 5.9+
- 🇨🇳 **Chinese Friendly**: Excellent Chinese language support via DeepSeek models

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone git@github.com:HeiSir2014/OpenAIRouter.git
cd OpenAIRouter
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your OpenRouter API key and configuration
```

**Default Configuration (Free DeepSeek Model):**
```bash
# Get your free API key from https://openrouter.ai/
OPENAI_API_KEY=sk-or-v1-your-openrouter-key-here
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_DEFAULT_MODEL=deepseek/deepseek-chat-v3.1:free
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-must-be-at-least-32-characters-long
```

4. Start the development server:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Usage

#### Authentication

First, create a user account and API key through the admin endpoints, then use the API key in your requests:

```bash
# Using default DeepSeek model (free)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请用中文回答问题"}
    ]
  }'

# Specify model explicitly
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-chat-v3.1:free",
    "messages": [
      {"role": "user", "content": "Explain quantum computing"}
    ]
  }'
```

#### Supported Endpoints

- `POST /v1/chat/completions` - Chat completions (OpenAI compatible)
- `GET /v1/models` - List available models
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /api-keys` - Create API key
- `GET /usage` - Get usage statistics

## Development

### Project Structure

```
src/
├── controllers/     # API route handlers
├── services/       # Business logic
├── database/       # Database models and connections
├── providers/      # AI provider adapters
├── middleware/     # Express middleware
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
├── config/         # Configuration files
└── routes/         # Route definitions
```

### Scripts

- `npm run dev` - Start development server with hot reload (TypeScript direct execution)
- `npm start` - Start production server (TypeScript direct execution)
- `npm run build` - Compile TypeScript to JavaScript
- `npm run build:prod` - Build and run compiled JavaScript (fastest startup)
- `npm run type-check` - Type check without compilation
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

**Note**: This project runs TypeScript directly without pre-compilation for faster development and simpler deployment.

### Code Style

This project follows Google TypeScript Style Guide:
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment mode | `development` | No |
| `PORT` | Server port | `3000` | No |
| `DB_PATH` | SQLite database path | `./database/app.db` | No |
| `JWT_SECRET` | JWT signing secret (32+ chars) | - | **Yes** |
| `OPENAI_API_KEY` | OpenRouter/OpenAI API key | - | **Yes** |
| `OPENAI_BASE_URL` | API base URL | `https://api.openai.com/v1` | No |
| `OPENAI_DEFAULT_MODEL` | Default model | `gpt-3.5-turbo` | No |
| `ANTHROPIC_API_KEY` | Anthropic API key | - | No |

### Supported Models

#### Free Models (via OpenRouter)
- `deepseek/deepseek-chat-v3.1:free` - **Free** DeepSeek model (default)
- `deepseek/deepseek-chat` - Paid DeepSeek model

#### OpenRouter Models
- `openai/gpt-4o` - GPT-4 Omni
- `openai/gpt-4o-mini` - GPT-4 Omni Mini
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet

#### Native OpenAI Models (if using OpenAI directly)
- `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`, etc.

### Provider Configuration

Add new providers by implementing the `BaseProvider` interface and registering them in the provider factory.

## Architecture

### Phase 1: SQLite + Direct Database Access ✅
- SQLite for data persistence
- Direct database queries
- Basic caching in memory
- ES Modules with TypeScript 5.9+
- OpenRouter integration with free DeepSeek model

### Phase 2: Redis Integration (Planned)
- Redis for caching and session management
- Improved performance and scalability
- Distributed rate limiting

## Why OpenRouter + DeepSeek?

### 🆓 Cost Advantages
- **DeepSeek Chat v3.1**: Completely free via OpenRouter
- **High Performance**: Near GPT-4 level capabilities
- **Chinese Language**: Excellent Chinese understanding and generation
- **No Rate Limits**: Stable service through OpenRouter

### 📊 Model Comparison
| Model | Cost | Performance | Chinese Support | Availability |
|-------|------|-------------|-----------------|--------------|
| DeepSeek Chat v3.1 Free | **Free** | High | Excellent | ✅ Default |
| GPT-4o | $5/1M tokens | Highest | Good | Via OpenRouter |
| GPT-3.5 Turbo | $0.5/1M tokens | Medium | Good | Via OpenAI |
| Claude 3.5 Sonnet | $3/1M tokens | High | Good | Via OpenRouter |

## Technology Stack

- **Runtime**: Node.js 18+ with ES Modules
- **Framework**: Express 5.x
- **Language**: TypeScript 5.9+
- **Database**: SQLite (Phase 1) → Redis (Phase 2)
- **Authentication**: JWT + bcrypt
- **Validation**: Zod 4.x
- **Logging**: Winston
- **Testing**: Jest with ES Module support
- **Code Quality**: ESLint 9.x (Flat Config) + Prettier

## Documentation

- 📖 [Getting Started Guide](docs/getting-started.md)
- 🔧 [OpenRouter Configuration](docs/openrouter-configuration.md)
- 🚀 [Development Plan](docs/development-plan.md)
- 📚 [API Reference](docs/api-reference.md)
- 🔄 [ES Module Migration](docs/esmodule-migration-summary.md)
- 🛠️ [Git Setup Guide](docs/git-setup.md)

## Contributing

1. Fork the repository: `https://github.com/HeiSir2014/OpenAIRouter`
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the code style guidelines
4. Add tests for new functionality
5. Commit your changes: `git commit -m 'feat: add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Submit a pull request

### Development Guidelines

- Follow [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- Use [Conventional Commits](https://www.conventionalcommits.org/) format
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass: `npm test`
- Run linting: `npm run lint`

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- 🏠 **Homepage**: https://github.com/HeiSir2014/OpenAIRouter
- 🐛 **Issues**: https://github.com/HeiSir2014/OpenAIRouter/issues
- 📖 **Documentation**: [docs/](docs/)
- 🌐 **OpenRouter**: https://openrouter.ai/
- 🤖 **DeepSeek**: https://www.deepseek.com/

## Support

For issues and questions:
1. Check the [documentation](docs/)
2. Search existing [issues](https://github.com/HeiSir2014/OpenAIRouter/issues)
3. Create a new issue if needed

## Acknowledgments

- [OpenRouter](https://openrouter.ai/) for providing free access to DeepSeek models
- [DeepSeek](https://www.deepseek.com/) for their excellent open-source models
- The Node.js and TypeScript communities for amazing tools and libraries
