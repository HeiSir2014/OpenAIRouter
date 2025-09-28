/**
 * Error handling middleware
 * Centralized error handling and response formatting
 */

import { Request, Response, NextFunction } from 'express';

import { logger } from '../utils/logger.util.js';
import { ApiError, ErrorType } from '../types/common.types.js';
import { isDevelopment } from '../config/app.config.js';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  public statusCode: number;
  public type: ErrorType;
  public code: string;
  public details?: Record<string, unknown>;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    type: ErrorType = 'internal_error',
    code: string = 'internal_error',
    details?: Record<string, unknown>,
  ) {
    super(message);

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.type = type;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create standardized API error
 */
export const createApiError = (
  message: string,
  statusCode: number = 500,
  type: ErrorType = 'internal_error',
  code: string = 'internal_error',
  details?: Record<string, unknown>,
): AppError => {
  return new AppError(message, statusCode, type, code, details);
};

/**
 * Authentication error
 */
export const createAuthError = (message: string = 'Authentication failed'): AppError => {
  return new AppError(message, 401, 'authentication_error', 'authentication_failed');
};

/**
 * Authorization error
 */
export const createAuthorizationError = (message: string = 'Access denied'): AppError => {
  return new AppError(message, 403, 'authorization_error', 'access_denied');
};

/**
 * Not found error
 */
export const createNotFoundError = (resource: string = 'Resource'): AppError => {
  return new AppError(`${resource} not found`, 404, 'not_found_error', 'resource_not_found');
};

/**
 * Validation error
 */
export const createValidationError = (
  message: string = 'Validation failed',
  details?: Record<string, unknown>,
): AppError => {
  return new AppError(message, 400, 'validation_error', 'validation_failed', details);
};

/**
 * Rate limit error
 */
export const createRateLimitError = (
  message: string = 'Rate limit exceeded',
  details?: Record<string, unknown>,
): AppError => {
  return new AppError(message, 429, 'rate_limit_error', 'rate_limit_exceeded', details);
};

/**
 * Provider error
 */
export const createProviderError = (
  provider: string,
  message: string,
  statusCode: number = 502,
  details?: Record<string, unknown>,
): AppError => {
  return new AppError(
    `Provider error (${provider}): ${message}`,
    statusCode,
    'provider_error',
    'provider_request_failed',
    { provider, ...details },
  );
};

/**
 * External API error
 */
export const createExternalApiError = (
  service: string,
  message: string,
  statusCode: number = 502,
  details?: Record<string, unknown>,
): AppError => {
  return new AppError(
    `External API error (${service}): ${message}`,
    statusCode,
    'external_api_error',
    'external_api_failed',
    { service, ...details },
  );
};

/**
 * Error handling middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    next(error);
    return;
  }

  let statusCode = 500;
  let apiError: ApiError;

  if (error instanceof AppError) {
    // Handle application errors
    statusCode = error.statusCode;
    apiError = {
      code: error.code,
      message: error.message,
      type: error.type,
      details: error.details,
    };

    // Log operational errors as warnings, others as errors
    if (error.isOperational) {
      logger.warn('Operational error', {
        error: error.message,
        statusCode,
        type: error.type,
        code: error.code,
        details: error.details,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        ip: req.ip,
      });
    } else {
      logger.error('Application error', {
        error: error.message,
        stack: error.stack,
        statusCode,
        type: error.type,
        code: error.code,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        ip: req.ip,
      });
    }
  } else {
    // Handle unexpected errors
    logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      ip: req.ip,
    });

    // Don't expose internal errors in production
    if (isDevelopment()) {
      apiError = {
        code: 'internal_error',
        message: error.message,
        type: 'internal_error',
        stack: error.stack,
      };
    } else {
      apiError = {
        code: 'internal_error',
        message: 'Internal server error',
        type: 'internal_error',
      };
    }
  }

  // Send error response
  res.status(statusCode).json({
    error: apiError,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });
};

/**
 * 404 handler middleware
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const error = createNotFoundError('Endpoint');

  logger.warn('Endpoint not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  res.status(404).json({
    error: {
      code: error.code,
      message: `Endpoint ${req.method} ${req.path} not found`,
      type: error.type,
    },
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  });
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle specific error types
 */
export const handleDatabaseError = (error: any): AppError => {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return createValidationError('Duplicate entry', {
      constraint: 'unique',
      field: error.message,
    });
  }

  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return createValidationError('Invalid reference', {
      constraint: 'foreign_key',
    });
  }

  if (error.code === 'SQLITE_CONSTRAINT_CHECK') {
    return createValidationError('Invalid value', {
      constraint: 'check',
    });
  }

  return createApiError('Database error', 500, 'internal_error', 'database_error', {
    originalError: error.message,
  });
};

/**
 * Handle Axios errors (for provider requests)
 */
export const handleAxiosError = (error: any, provider: string): AppError => {
  if (error.response) {
    // The request was made and the server responded with a status code
    const statusCode = error.response.status;
    const message = error.response.data?.error?.message || error.message;

    return createProviderError(provider, message, statusCode, {
      statusCode,
      responseData: error.response.data,
    });
  } else if (error.request) {
    // The request was made but no response was received
    return createProviderError(provider, 'No response received', 503, {
      timeout: error.code === 'ECONNABORTED',
    });
  } else {
    // Something happened in setting up the request
    return createProviderError(provider, error.message, 500);
  }
};

/**
 * Graceful shutdown error handler
 */
export const handleUncaughtException = (error: Error): void => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });

  // Give time for logging to complete
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

/**
 * Unhandled promise rejection handler
 */
export const handleUnhandledRejection = (reason: any, promise: Promise<any>): void => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
  });

  // Give time for logging to complete
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};
