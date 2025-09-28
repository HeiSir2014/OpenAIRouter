/**
 * Chat routes
 * OpenAI-compatible chat completion routes
 */

import { Router } from 'express';

import { ChatController } from '../controllers/chat.controller.js';
import { conditionalAuthMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { validateContentType } from '../middleware/validation.middleware.js';
import { apiKeyRateLimit, tokenRateLimit } from '../middleware/rate-limit.middleware.js';

/**
 * Create chat routes
 */
export const createChatRoutes = (): Router => {
  const router = Router();
  const chatController = new ChatController();

  // All chat routes require authentication (can be disabled via config)
  router.use(conditionalAuthMiddleware);

  // Apply rate limiting
  router.use(apiKeyRateLimit());
  router.use(tokenRateLimit());

  /**
   * @route POST /v1/chat/completions
   * @desc Create chat completion (OpenAI compatible)
   * @access Private
   */
  router.post(
    '/chat/completions',
    validateContentType(['application/json']),
    chatController.createChatCompletion,
  );

  /**
   * @route POST /v1/chat/completions/estimate
   * @desc Estimate request cost
   * @access Private
   */
  router.post(
    '/chat/completions/estimate',
    validateContentType(['application/json']),
    chatController.estimateCost,
  );

  /**
   * @route POST /v1/chat/completions/validate
   * @desc Validate request format
   * @access Private
   */
  router.post(
    '/chat/completions/validate',
    validateContentType(['application/json']),
    chatController.validateRequest,
  );

  /**
   * @route GET /v1/models
   * @desc List available models (OpenAI compatible)
   * @access Private
   */
  router.get('/models', chatController.listModels);

  /**
   * @route GET /v1/models/:modelId
   * @desc Get model information (OpenAI compatible)
   * @access Private
   */
  router.get('/models/:modelId', chatController.getModel);

  /**
   * @route GET /v1/health
   * @desc Health check for chat service
   * @access Private
   */
  router.get('/health', chatController.healthCheck);

  /**
   * @route GET /v1/features
   * @desc Get supported features
   * @access Private
   */
  router.get('/features', chatController.getFeatures);

  /**
   * @route GET /v1/usage
   * @desc Get usage statistics
   * @access Private
   */
  router.get('/usage', chatController.getUsage);

  /**
   * @route POST /v1/test
   * @desc Test endpoint for development
   * @access Private
   */
  router.post('/test', chatController.test);

  return router;
};
