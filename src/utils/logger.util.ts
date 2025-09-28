/**
 * Logging utility
 * Centralized logging with Winston
 */

import winston from 'winston';
import path from 'path';

import { appConfig } from '../config/app.config.js';

/**
 * Safely serialize error objects
 */
const serializeError = (error: any): any => {
  if (error instanceof Error) {
    const result: any = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    if (error.cause) {
      result.cause = error.cause;
    }
    return result;
  }
  return error;
};

/**
 * Safely serialize meta objects
 */
const serializeMeta = (meta: any): any => {
  if (meta === null || meta === undefined) {
    return meta;
  }
  
  if (meta instanceof Error) {
    return serializeError(meta);
  }
  
  // Handle primitive types
  if (typeof meta !== 'object') {
    return meta;
  }
  
  // Handle arrays
  if (Array.isArray(meta)) {
    return meta.map(serializeMeta);
  }
  
  // Handle special objects that shouldn't be serialized
  if (meta.constructor && meta.constructor.name === 'Object' && Object.getPrototypeOf(meta) === null) {
    // Handle null prototype objects
    const result: any = {};
    for (const key in meta) {
      if (meta.hasOwnProperty(key)) {
        result[key] = serializeMeta(meta[key]);
      }
    }
    return result;
  }
  
  // Handle regular objects
  if (typeof meta === 'object' && meta.constructor === Object) {
    const result: any = {};
    for (const key in meta) {
      if (meta.hasOwnProperty(key)) {
        result[key] = serializeMeta(meta[key]);
      }
    }
    return result;
  }
  
  // Handle other objects by converting to string
  try {
    return String(meta);
  } catch (error) {
    return '[Object]';
  }
};

/**
 * Custom log format
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      try {
        const serializedMeta = serializeMeta(meta);
        const metaString = JSON.stringify(serializedMeta, null, 2);
        if (metaString && metaString !== '{}') {
          logMessage += ` ${metaString}`;
        }
      } catch (error) {
        // Fallback for any remaining issues
        try {
          logMessage += ` ${JSON.stringify(meta, null, 2)}`;
        } catch (fallbackError) {
          logMessage += ` [Serialization Error: ${String(fallbackError)}]`;
        }
      }
    }
    return logMessage;
  }),
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logMessage = `${timestamp} ${level}: ${message}`;

    if (Object.keys(meta).length > 0) {
      try {
        const serializedMeta = serializeMeta(meta);
        const metaString = JSON.stringify(serializedMeta, null, 2);
        if (metaString && metaString !== '{}') {
          logMessage += ` ${metaString}`;
        }
      } catch (error) {
        // Fallback for any remaining issues
        try {
          logMessage += ` ${JSON.stringify(meta, null, 2)}`;
        } catch (fallbackError) {
          logMessage += ` [Serialization Error: ${String(fallbackError)}]`;
        }
      }
    }

    return logMessage;
  }),
);

/**
 * Create transports based on environment
 */
const createTransports = async (): Promise<winston.transport[]> => {
  const transports: winston.transport[] = [];

  // Console transport (always enabled)
  transports.push(
    new winston.transports.Console({
      format: appConfig.env === 'development' ? consoleFormat : logFormat,
      level: appConfig.logLevel,
    }),
  );

  // File transport (if configured)
  if (appConfig.logFile) {
    const logDir = path.dirname(appConfig.logFile);

    // Ensure log directory exists
    try {
      const fs = await import('fs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.warn('Failed to create log directory:', error);
    }

    transports.push(
      new winston.transports.File({
        filename: appConfig.logFile,
        format: logFormat,
        level: appConfig.logLevel,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
      }),
    );

    // Error log file
    transports.push(
      new winston.transports.File({
        filename: appConfig.logFile.replace('.log', '.error.log'),
        format: logFormat,
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
        tailable: true,
      }),
    );
  }

  return transports;
};

/**
 * Logger instance (lazy loaded)
 */
let _logger: winston.Logger | null = null;

export const logger = new Proxy({} as winston.Logger, {
  get(target, prop) {
    if (!_logger) {
      // Initialize with console transport first, then add file transport asynchronously
      _logger = winston.createLogger({
        level: appConfig.logLevel,
        format: logFormat,
        transports: [
          new winston.transports.Console({
            format: appConfig.env === 'development' ? consoleFormat : logFormat,
            level: appConfig.logLevel,
          }),
        ],
        exitOnError: false,
      });

      // Add file transport asynchronously if configured
      if (appConfig.logFile) {
        createTransports()
          .then(transports => {
            // Replace transports with full set including file transport
            _logger!.clear();
            transports.forEach(transport => _logger!.add(transport));
          })
          .catch(error => {
            console.warn('Failed to initialize file logging:', error);
          });
      }
    }
    return (_logger as any)[prop];
  },
});

/**
 * Request logger middleware helper
 */
export const createRequestLogger = () => {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    // Add request ID to request object
    req.requestId = requestId;

    logger.info('Request started', {
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;

      logger.info('Request completed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    });

    next();
  };
};

/**
 * Log API usage
 */
export const logApiUsage = (data: {
  userId: string;
  apiKeyId: string;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
  latency: number;
  success: boolean;
  error?: string;
}) => {
  logger.info('API usage', {
    type: 'api_usage',
    ...data,
  });
};

/**
 * Log provider errors
 */
export const logProviderError = (data: {
  provider: string;
  model: string;
  error: string;
  statusCode?: number;
  latency: number;
}) => {
  logger.error('Provider error', {
    type: 'provider_error',
    ...data,
  });
};

/**
 * Log authentication events
 */
export const logAuthEvent = (data: {
  event: 'login' | 'register' | 'api_key_created' | 'api_key_used' | 'auth_failed';
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}) => {
  logger.info('Authentication event', {
    type: 'auth_event',
    ...data,
  });
};

/**
 * Log system events
 */
export const logSystemEvent = (data: {
  event: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  logger.info('System event', {
    type: 'system_event',
    ...data,
  });
};

/**
 * Development-only debug logging
 */
export const debugLog = (message: string, data?: Record<string, unknown>) => {
  if (appConfig.env === 'development') {
    logger.debug(message, data);
  }
};
