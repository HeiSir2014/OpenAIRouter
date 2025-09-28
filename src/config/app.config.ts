/**
 * Application configuration
 * Centralized configuration management with environment variable validation
 */

// Import environment config first to ensure env variables are loaded
import './env.config.js';
import { AppConfig, Environment } from '../types/common.types.js';

/**
 * Load and validate environment variables
 */
function loadConfig(): AppConfig {
  // Load environment variables
  const env = (process.env['NODE_ENV'] as Environment) || 'development';
  const port = parseInt(process.env['PORT'] || '3000', 10);
  const dbPath = process.env['DB_PATH'] || './database/app.db';
  const jwtSecret = process.env['JWT_SECRET'];
  const jwtExpiresIn = process.env['JWT_EXPIRES_IN'] || '7d';
  const logLevel = process.env['LOG_LEVEL'] || 'info';
  const logFile = process.env['LOG_FILE'];
  const corsOrigins = process.env['CORS_ORIGINS']?.split(',') || ['*'];
  const disableAuth = process.env['DISABLE_AUTH'] === 'true';

  // Rate limiting configuration
  const defaultRpm = parseInt(process.env['DEFAULT_RATE_LIMIT_RPM'] || '60', 10);
  const defaultTpm = parseInt(process.env['DEFAULT_RATE_LIMIT_TPM'] || '10000', 10);
  const windowMs = parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '60000', 10);

  // Validate required environment variables
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return {
    env,
    port,
    dbPath,
    jwtSecret,
    jwtExpiresIn,
    logLevel,
    logFile,
    corsOrigins,
    rateLimits: {
      defaultRpm,
      defaultTpm,
      windowMs,
    },
    disableAuth,
  };
}

/**
 * Application configuration instance (lazy loaded)
 */
let _appConfig: AppConfig | null = null;

export const appConfig: AppConfig = new Proxy({} as AppConfig, {
  get(target, prop) {
    if (!_appConfig) {
      _appConfig = loadConfig();
    }
    return _appConfig[prop as keyof AppConfig];
  },
});

/**
 * Check if running in development mode
 */
export const isDevelopment = (): boolean => appConfig.env === 'development';

/**
 * Check if running in production mode
 */
export const isProduction = (): boolean => appConfig.env === 'production';

/**
 * Check if running in test mode
 */
export const isTest = (): boolean => appConfig.env === 'test';

/**
 * Get database configuration
 */
export const getDatabaseConfig = () => ({
  path: appConfig.dbPath,
  options: {
    verbose: isDevelopment() ? console.log : undefined,
  },
});

/**
 * Get JWT configuration
 */
export const getJwtConfig = () => {
  if (!appConfig.jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return {
    secret: appConfig.jwtSecret,
    expiresIn: appConfig.jwtExpiresIn,
    algorithm: 'HS256' as const,
  };
};

/**
 * Get CORS configuration
 */
export const getCorsConfig = () => ({
  origin: appConfig.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

/**
 * Get rate limiting configuration
 */
export const getRateLimitConfig = () => ({
  windowMs: appConfig.rateLimits.windowMs,
  max: appConfig.rateLimits.defaultRpm,
  message: {
    error: {
      message: 'Too many requests, please try again later',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Validate configuration on startup
 */
export const validateConfig = (): void => {
  const requiredEnvVars = ['JWT_SECRET'];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Required environment variable ${envVar} is not set`);
    }
  }

  // Additional validations
  if (appConfig.port < 1 || appConfig.port > 65535) {
    throw new Error('Invalid port number');
  }

  if (!['development', 'production', 'test'].includes(appConfig.env)) {
    throw new Error('Invalid NODE_ENV value');
  }
};
