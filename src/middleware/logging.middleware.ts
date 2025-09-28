/**
 * Logging middleware
 * Request/response logging and monitoring
 */

import { Request, Response, NextFunction } from 'express';

import { logger } from '../utils/logger.util.js';
import { generateUuid } from '../utils/crypto.util.js';

/**
 * Request logging middleware
 * Logs incoming requests and outgoing responses
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = generateUuid();

  // Add request ID to request object
  req.requestId = requestId;

  // Log incoming request
  logger.info('Request started', {
    requestId,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    ip: req.ip,
    userId: req.user?.id,
    apiKeyId: req.apiKey?.id,
  });

  // Capture original response methods
  const originalSend = res.send;
  const originalJson = res.json;

  // Track response body size
  let responseSize = 0;

  // Override res.send to capture response
  res.send = function (body: any) {
    if (body) {
      responseSize = Buffer.byteLength(body, 'utf8');
    }
    return originalSend.call(this, body);
  };

  // Override res.json to capture response
  res.json = function (body: any) {
    if (body) {
      responseSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    }
    return originalJson.call(this, body);
  };

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Determine log level based on status code
    let logLevel: 'info' | 'warn' | 'error' = 'info';
    if (statusCode >= 400 && statusCode < 500) {
      logLevel = 'warn';
    } else if (statusCode >= 500) {
      logLevel = 'error';
    }

    logger[logLevel]('Request completed', {
      requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      statusCode,
      duration: `${duration}ms`,
      responseSize: `${responseSize} bytes`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id,
      apiKeyId: req.apiKey?.id,
      authTime: req.authTime,
      estimatedTokens: req.estimatedTokens,
    });
  });

  // Log response on error
  res.on('error', error => {
    const duration = Date.now() - startTime;

    logger.error('Request error', {
      requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      duration: `${duration}ms`,
      error: error.message,
      stack: error.stack,
      ip: req.ip,
      userId: req.user?.id,
      apiKeyId: req.apiKey?.id,
    });
  });

  next();
};

/**
 * Security logging middleware
 * Logs security-related events
 */
export const securityLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\./, // Directory traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JavaScript protocol
    /data:/i, // Data protocol
  ];

  const userAgent = req.get('User-Agent') || '';
  const url = req.url;
  const body = JSON.stringify(req.body || {});

  // Check for suspicious patterns
  const isSuspicious = suspiciousPatterns.some(
    pattern => pattern.test(url) || pattern.test(userAgent) || pattern.test(body),
  );

  if (isSuspicious) {
    logger.warn('Suspicious request detected', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      userAgent,
      ip: req.ip,
      body: req.body,
      headers: req.headers,
      userId: req.user?.id,
    });
  }

  // Log failed authentication attempts
  res.on('finish', () => {
    if (res.statusCode === 401) {
      logger.warn('Authentication failed', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent,
        authHeader: req.get('Authorization') ? 'present' : 'missing',
      });
    }
  });

  next();
};

/**
 * Performance monitoring middleware
 * Tracks performance metrics
 */
export const performanceLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();

    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const memoryDelta = {
      rss: endMemory.rss - startMemory.rss,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      external: endMemory.external - startMemory.external,
    };

    // Log slow requests (> 1 second)
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta,
        statusCode: res.statusCode,
        userId: req.user?.id,
      });
    }

    // Log high memory usage requests (> 50MB)
    if (Math.abs(memoryDelta.heapUsed) > 50 * 1024 * 1024) {
      logger.warn('High memory usage request', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta,
        statusCode: res.statusCode,
        userId: req.user?.id,
      });
    }
  });

  next();
};

/**
 * API usage logging middleware
 * Logs API usage for billing and analytics
 */
export const apiUsageLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Only log for API endpoints
  if (!req.path.startsWith('/v1/')) {
    next();
    return;
  }

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Only log successful API calls
    if (statusCode >= 200 && statusCode < 300) {
      logger.info('API usage', {
        type: 'api_usage',
        requestId: req.requestId,
        method: req.method,
        endpoint: req.path,
        statusCode,
        duration,
        userId: req.user?.id,
        apiKeyId: req.apiKey?.id,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        model: req.body?.model,
        provider: req.body?.provider,
        estimatedTokens: req.estimatedTokens,
      });
    }
  });

  next();
};

/**
 * Error logging middleware
 * Logs detailed error information
 */
export const errorLogger = (req: Request, res: Response, next: NextFunction): void => {
  res.on('finish', () => {
    const statusCode = res.statusCode;

    // Log client errors (4xx)
    if (statusCode >= 400 && statusCode < 500) {
      logger.warn('Client error', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        apiKeyId: req.apiKey?.id,
        body: req.body,
        query: req.query,
      });
    }

    // Log server errors (5xx)
    if (statusCode >= 500) {
      logger.error('Server error', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        apiKeyId: req.apiKey?.id,
        body: req.body,
        query: req.query,
        headers: req.headers,
      });
    }
  });

  next();
};

/**
 * Combined logging middleware
 * Combines all logging functionality
 */
export const combinedLogger = [
  requestLogger,
  securityLogger,
  performanceLogger,
  apiUsageLogger,
  errorLogger,
];

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
