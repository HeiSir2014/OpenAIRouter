/**
 * Authentication routes
 * Routes for user authentication and API key management
 */

import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { validate, validateContentType } from '../middleware/validation.middleware.js';
import { rateLimit } from '../middleware/rate-limit.middleware.js';
import {
  registerRequestSchema,
  loginRequestSchema,
  createApiKeyRequestSchema,
} from '../utils/validation.util.js';

/**
 * Create authentication routes
 */
export const createAuthRoutes = (): Router => {
  const router = Router();
  const authController = new AuthController();

  // Rate limiting for auth endpoints
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 10, // Limit each IP to 10 requests per windowMs
    keyGenerator: (req) => req.ip || 'unknown',
  });

  const strictAuthRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // Stricter limit for sensitive operations
    keyGenerator: (req) => req.ip || 'unknown',
  });

  // Public routes (no authentication required)
  
  /**
   * @route POST /auth/register
   * @desc Register a new user
   * @access Public
   */
  router.post(
    '/register',
    authRateLimit,
    validateContentType(['application/json']),
    validate(registerRequestSchema),
    authController.register
  );

  /**
   * @route POST /auth/login
   * @desc Login user
   * @access Public
   */
  router.post(
    '/login',
    authRateLimit,
    validateContentType(['application/json']),
    validate(loginRequestSchema),
    authController.login
  );

  /**
   * @route GET /auth/health
   * @desc Health check for auth service
   * @access Public
   */
  router.get('/health', authController.healthCheck);

  // Protected routes (authentication required)

  /**
   * @route GET /auth/profile
   * @desc Get user profile
   * @access Private
   */
  router.get('/profile', authMiddleware, authController.getProfile);

  /**
   * @route PUT /auth/profile
   * @desc Update user profile
   * @access Private
   */
  router.put(
    '/profile',
    authMiddleware,
    validateContentType(['application/json']),
    authController.updateProfile
  );

  /**
   * @route POST /auth/change-password
   * @desc Change user password
   * @access Private
   */
  router.post(
    '/change-password',
    authMiddleware,
    strictAuthRateLimit,
    validateContentType(['application/json']),
    authController.changePassword
  );

  /**
   * @route GET /auth/usage
   * @desc Get user usage statistics
   * @access Private
   */
  router.get('/usage', authMiddleware, authController.getUsageStats);

  /**
   * @route GET /auth/billing
   * @desc Get billing summary
   * @access Private
   */
  router.get('/billing', authMiddleware, authController.getBillingSummary);

  // API Key management routes

  /**
   * @route POST /api-keys
   * @desc Create new API key
   * @access Private
   */
  router.post(
    '/api-keys',
    authMiddleware,
    validateContentType(['application/json']),
    validate(createApiKeyRequestSchema),
    authController.createApiKey
  );

  /**
   * @route GET /api-keys
   * @desc List user's API keys
   * @access Private
   */
  router.get('/api-keys', authMiddleware, authController.listApiKeys);

  /**
   * @route GET /api-keys/:keyId
   * @desc Get API key details
   * @access Private
   */
  router.get('/api-keys/:keyId', authMiddleware, authController.getApiKey);

  /**
   * @route PUT /api-keys/:keyId
   * @desc Update API key
   * @access Private
   */
  router.put(
    '/api-keys/:keyId',
    authMiddleware,
    validateContentType(['application/json']),
    authController.updateApiKey
  );

  /**
   * @route DELETE /api-keys/:keyId
   * @desc Delete API key
   * @access Private
   */
  router.delete('/api-keys/:keyId', authMiddleware, authController.deleteApiKey);

  return router;
};
