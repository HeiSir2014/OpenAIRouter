/**
 * Main application file
 * Express server setup and configuration
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { appConfig, getCorsConfig, validateConfig } from './config/app.config.js';
import { initializeProviders } from './providers/factory.js';
import { validateProviderConfigs } from './config/providers.config.js';
import { DatabaseConnection } from './database/connection.js';
import { createAuthRoutes } from './routes/auth.routes.js';
import { createChatRoutes } from './routes/chat.routes.js';
import { createHealthRoutes } from './routes/health.routes.js';
import { combinedLogger } from './middleware/logging.middleware.js';
import { globalRateLimit } from './middleware/rate-limit.middleware.js';
import {
  errorHandler,
  notFoundHandler,
  handleUncaughtException,
  handleUnhandledRejection,
} from './middleware/error.middleware.js';
import { logger, logSystemEvent } from './utils/logger.util.js';


/**
 * Create Express application
 */
export const createApp = async (): Promise<express.Application> => {
  const app = express();

  try {
    // Validate configuration
    validateConfig();
    validateProviderConfigs();

    // Initialize database
    await DatabaseConnection.initialize();

    // Initialize providers
    initializeProviders();

    // Security middleware
    app.use(
      helmet({
        contentSecurityPolicy: false, // Disable CSP for API
        crossOriginEmbedderPolicy: false,
      }),
    );

    // CORS configuration
    app.use(cors(getCorsConfig()));

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Trust proxy (for accurate IP addresses)
    app.set('trust proxy', 1);

    // Global rate limiting
    app.use(globalRateLimit);

    // Logging middleware
    app.use(combinedLogger);

    // Health check routes (no authentication required)
    app.use('/health', createHealthRoutes());

    // API routes
    app.use('/auth', createAuthRoutes());
    app.use('/v1', createChatRoutes());

    // Root endpoint
    app.get('/', (_req, res) => {
      res.json({
        name: 'OpenAI Router',
        version: '1.0.0',
        description: 'OpenAI API compatible router with multi-provider support',
        environment: appConfig.env,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          auth: '/auth',
          chat: '/v1/chat/completions',
          models: '/v1/models',
        },
        documentation: 'https://github.com/your-repo/openai-router',
      });
    });

    // 404 handler
    app.use(notFoundHandler);

    // Error handling middleware (must be last)
    app.use(errorHandler);

    logSystemEvent({
      event: 'app_initialized',
      message: 'Express application initialized successfully',
      metadata: {
        environment: appConfig.env,
        port: appConfig.port,
      },
    });

    return app;
  } catch (error) {
    logger.error('Failed to create application', { error });
    throw error;
  }
};

/**
 * Start the server
 */
export const startServer = async (): Promise<void> => {
  try {
    const app = await createApp();

    const server = app.listen(appConfig.port, () => {
      logger.info('Server started successfully', {
        port: appConfig.port,
        environment: appConfig.env,
        nodeVersion: process.version,
        pid: process.pid,
      });

      logSystemEvent({
        event: 'server_started',
        message: `Server listening on port ${appConfig.port}`,
        metadata: {
          port: appConfig.port,
          environment: appConfig.env,
        },
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown`);

      server.close(() => {
        logger.info('HTTP server closed');

        // Close database connection
        DatabaseConnection.close();

        logSystemEvent({
          event: 'server_shutdown',
          message: 'Server shutdown completed',
          metadata: { signal },
        });

        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);

    // Periodic maintenance tasks
    setInterval(
      () => {
        DatabaseConnection.maintenance();
      },
      24 * 60 * 60 * 1000,
    ); // Run daily
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Start server if this file is run directly
// Use cross-platform compatible ESM entry detection
import { isMain } from './utils/esm-main.util.js';

if (isMain(import.meta.url)) {
  startServer().catch(error => {
    logger.error('Failed to start server', { error });
    process.exit(1);
  });
}
