/**
 * Validation middleware
 * Request validation using Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { createValidationError } from '../utils/validation.util.js';
import { logger } from '../utils/logger.util.js';

/**
 * Generic validation middleware factory
 */
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = createValidationError(error);

        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors: validationError.error.details,
          userId: req.user?.id,
        });

        res.status(400).json(validationError);
      } else {
        logger.error('Validation middleware error', {
          error,
          path: req.path,
          method: req.method,
        });

        res.status(500).json({
          error: {
            message: 'Internal validation error',
            type: 'internal_error',
            code: 'validation_internal_error',
          },
        });
      }
    }
  };
};

/**
 * Query parameter validation middleware factory
 */
export const validateQuery = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate query parameters
      req.query = schema.parse(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = createValidationError(error);

        logger.warn('Query validation failed', {
          path: req.path,
          method: req.method,
          errors: validationError.error.details,
          userId: req.user?.id,
        });

        res.status(400).json(validationError);
      } else {
        logger.error('Query validation middleware error', {
          error,
          path: req.path,
          method: req.method,
        });

        res.status(500).json({
          error: {
            message: 'Internal validation error',
            type: 'internal_error',
            code: 'validation_internal_error',
          },
        });
      }
    }
  };
};

/**
 * URL parameter validation middleware factory
 */
export const validateParams = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate URL parameters
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError = createValidationError(error);

        logger.warn('Params validation failed', {
          path: req.path,
          method: req.method,
          errors: validationError.error.details,
          userId: req.user?.id,
        });

        res.status(400).json(validationError);
      } else {
        logger.error('Params validation middleware error', {
          error,
          path: req.path,
          method: req.method,
        });

        res.status(500).json({
          error: {
            message: 'Internal validation error',
            type: 'internal_error',
            code: 'validation_internal_error',
          },
        });
      }
    }
  };
};

/**
 * Content-Type validation middleware
 */
export const validateContentType = (allowedTypes: string[] = ['application/json']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentType = req.get('Content-Type');

    if (!contentType) {
      res.status(400).json({
        error: {
          message: 'Content-Type header is required',
          type: 'validation_error',
          code: 'missing_content_type',
        },
      });
      return;
    }

    const isValidType = allowedTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase()),
    );

    if (!isValidType) {
      res.status(415).json({
        error: {
          message: `Unsupported Content-Type. Allowed types: ${allowedTypes.join(', ')}`,
          type: 'validation_error',
          code: 'unsupported_content_type',
          details: {
            provided: contentType,
            allowed: allowedTypes,
          },
        },
      });
      return;
    }

    next();
  };
};

/**
 * Request size validation middleware
 */
export const validateRequestSize = (maxSizeBytes: number = 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.get('Content-Length');

    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      res.status(413).json({
        error: {
          message: `Request too large. Maximum size: ${maxSizeBytes} bytes`,
          type: 'validation_error',
          code: 'request_too_large',
          details: {
            maxSize: maxSizeBytes,
            actualSize: parseInt(contentLength, 10),
          },
        },
      });
      return;
    }

    next();
  };
};

/**
 * API version validation middleware
 */
export const validateApiVersion = (supportedVersions: string[] = ['v1']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const version = req.params.version || req.get('API-Version') || 'v1';

    if (!supportedVersions.includes(version)) {
      res.status(400).json({
        error: {
          message: `Unsupported API version: ${version}`,
          type: 'validation_error',
          code: 'unsupported_api_version',
          details: {
            provided: version,
            supported: supportedVersions,
          },
        },
      });
      return;
    }

    // Add version to request for later use
    req.apiVersion = version;
    next();
  };
};

/**
 * Model validation middleware
 * Validates that the requested model is supported
 */
export const validateModel = (supportedModels: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const model = req.body?.model;

    if (!model) {
      // Model is optional in some cases, let the controller handle it
      next();
      return;
    }

    if (!supportedModels.includes(model)) {
      res.status(400).json({
        error: {
          message: `Unsupported model: ${model}`,
          type: 'validation_error',
          code: 'unsupported_model',
          details: {
            provided: model,
            supported: supportedModels,
          },
        },
      });
      return;
    }

    next();
  };
};

/**
 * Rate limit validation middleware
 * Checks if request would exceed user's rate limits
 */
export const validateRateLimit = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      // No API key, skip rate limit validation
      next();
      return;
    }

    // TODO: Implement actual rate limiting logic
    // This is a placeholder for now

    // For now, just add rate limit info to response headers
    res.set({
      'X-RateLimit-Limit-RPM': apiKey.rateLimitRpm.toString(),
      'X-RateLimit-Limit-TPM': apiKey.rateLimitTpm.toString(),
    });

    next();
  };
};

/**
 * Sanitize request middleware
 * Sanitizes request data to prevent XSS and injection attacks
 */
export const sanitizeRequest = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize query parameters
      if (req.query) {
        for (const [key, value] of Object.entries(req.query)) {
          if (typeof value === 'string') {
            req.query[key] = value.trim().substring(0, 1000);
          }
        }
      }

      // Sanitize body (be careful not to break JSON structure)
      if (req.body && typeof req.body === 'object') {
        sanitizeObject(req.body);
      }

      next();
    } catch (error) {
      logger.error('Request sanitization error', {
        error,
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        error: {
          message: 'Request processing error',
          type: 'internal_error',
          code: 'sanitization_error',
        },
      });
    }
  };
};

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any, depth: number = 0): void {
  // Prevent infinite recursion
  if (depth > 10) {
    return;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Basic string sanitization
      obj[key] = value.trim();

      // Limit string length to prevent abuse
      if (obj[key].length > 10000) {
        obj[key] = obj[key].substring(0, 10000);
      }
    } else if (typeof value === 'object' && value !== null) {
      sanitizeObject(value, depth + 1);
    }
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}
