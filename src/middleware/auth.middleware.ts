/**
 * Authentication middleware
 * Validates API keys and attaches user information to requests
 */

import { Request, Response, NextFunction } from 'express';

import { ApiKeyModel } from '../database/models/api-key.model.js';
import { UserModel } from '../database/models/user.model.js';
import { hashApiKey, isValidApiKeyFormat } from '../utils/crypto.util.js';
import { logger, logAuthEvent } from '../utils/logger.util.js';
import { appConfig } from '../config/app.config.js';

/**
 * Authentication middleware
 * Validates Bearer token (API key) and attaches user/apiKey to request
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const startTime = Date.now();

  try {
    // Skip authentication if disabled in config
    if (appConfig.disableAuth) {
      logger.info('Authentication disabled, skipping token validation', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      next();
      return;
    }

    // Extract authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      logAuthEvent({
        event: 'auth_failed',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        error: 'Missing authorization header',
      });

      res.status(401).json({
        error: {
          message: 'Missing or invalid authorization header. Please provide a valid API key.',
          type: 'authentication_error',
          code: 'missing_authorization',
        },
      });
      return;
    }

    // Extract API key
    const apiKey = authHeader.substring(7);

    // Validate API key format
    if (!isValidApiKeyFormat(apiKey)) {
      logAuthEvent({
        event: 'auth_failed',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        error: 'Invalid API key format',
      });

      res.status(401).json({
        error: {
          message: 'Invalid API key format',
          type: 'authentication_error',
          code: 'invalid_api_key_format',
        },
      });
      return;
    }

    // Hash the API key for database lookup
    const keyHash = hashApiKey(apiKey);

    // Initialize models
    const apiKeyModel = new ApiKeyModel();
    const userModel = new UserModel();

    // Find API key in database
    const keyData = await apiKeyModel.findByKeyHash(keyHash);

    if (!keyData || !keyData.isActive) {
      logAuthEvent({
        event: 'auth_failed',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        error: 'Invalid or inactive API key',
      });

      res.status(401).json({
        error: {
          message: 'Invalid or inactive API key',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      });
      return;
    }

    // Find associated user
    const user = await userModel.findById(keyData.userId);

    if (!user) {
      logger.error('API key found but user not found', {
        apiKeyId: keyData.id,
        userId: keyData.userId,
      });

      res.status(401).json({
        error: {
          message: 'User account not found',
          type: 'authentication_error',
          code: 'user_not_found',
        },
      });
      return;
    }

    // Update last used timestamp (async, don't wait)
    apiKeyModel.updateLastUsed(keyData.id).catch(error => {
      logger.warn('Failed to update API key last used timestamp', {
        error,
        apiKeyId: keyData.id,
      });
    });

    // Log successful authentication
    logAuthEvent({
      event: 'api_key_used',
      userId: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      success: true,
    });

    // Attach user and API key to request
    req.user = user;
    req.apiKey = keyData;

    // Add timing information
    const authTime = Date.now() - startTime;
    req.authTime = authTime;

    next();
  } catch (error) {
    logger.error('Authentication middleware error', {
      error,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(500).json({
      error: {
        message: 'Internal authentication error',
        type: 'internal_error',
        code: 'auth_internal_error',
      },
    });
  }
};

/**
 * Optional authentication middleware
 * Similar to authMiddleware but doesn't fail if no auth is provided
 */
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  // If no auth header, continue without authentication
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  // If auth header exists, validate it
  await authMiddleware(req, res, next);
};

/**
 * Admin authentication middleware
 * Requires user to have admin privileges
 */
export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  // First run regular auth
  await authMiddleware(req, res, (error?: any) => {
    if (error) {
      next(error);
      return;
    }

    // Check if user has admin privileges
    const user = req.user;
    if (!user || user.plan !== 'enterprise') {
      logAuthEvent({
        event: 'auth_failed',
        userId: user?.id,
        email: user?.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        error: 'Insufficient privileges',
      });

      res.status(403).json({
        error: {
          message: 'Admin privileges required',
          type: 'authorization_error',
          code: 'insufficient_privileges',
        },
      });
      return;
    }

    next();
  });
};

/**
 * Plan-based authorization middleware factory
 * Creates middleware that checks for specific user plans
 */
export const requirePlan = (requiredPlans: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          type: 'authentication_error',
          code: 'authentication_required',
        },
      });
      return;
    }

    if (!requiredPlans.includes(user.plan)) {
      logAuthEvent({
        event: 'auth_failed',
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        error: `Plan ${user.plan} not authorized, requires: ${requiredPlans.join(', ')}`,
      });

      res.status(403).json({
        error: {
          message: `This feature requires a ${requiredPlans.join(' or ')} plan`,
          type: 'authorization_error',
          code: 'plan_upgrade_required',
          details: {
            currentPlan: user.plan,
            requiredPlans,
          },
        },
      });
      return;
    }

    next();
  };
};

/**
 * Credits check middleware
 * Ensures user has sufficient credits for the operation
 */
export const requireCredits = (minimumCredits: number = 0) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          type: 'authentication_error',
          code: 'authentication_required',
        },
      });
      return;
    }

    if (user.credits < minimumCredits) {
      logAuthEvent({
        event: 'auth_failed',
        userId: user.id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        success: false,
        error: `Insufficient credits: ${user.credits} < ${minimumCredits}`,
      });

      res.status(402).json({
        error: {
          message: 'Insufficient credits',
          type: 'authorization_error',
          code: 'insufficient_credits',
          details: {
            currentCredits: user.credits,
            requiredCredits: minimumCredits,
          },
        },
      });
      return;
    }

    next();
  };
};

/**
 * Conditional authentication middleware
 * Uses authMiddleware if authentication is enabled, otherwise skips authentication
 */
export const conditionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (appConfig.disableAuth) {
    logger.info('Authentication disabled, skipping token validation', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    next();
    return;
  }

  // Use regular authentication middleware
  await authMiddleware(req, res, next);
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      authTime?: number;
    }
  }
}
