/**
 * Chat controller
 * Handles OpenAI-compatible chat completion endpoints
 */

import { Request, Response } from 'express';

import { ChatService } from '../services/chat.service.js';
import { logger } from '../utils/logger.util.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { appConfig } from '../config/app.config.js';
import { User } from '../types/auth.types.js';

/**
 * Chat controller class
 */
export class ChatController {
  private chatService = new ChatService();

  /**
   * Get user and API key information, handling disabled authentication
   */
  private getUserAndApiKey(req: Request): { user: User; apiKeyId: string } {
    if (appConfig.disableAuth) {
      // Return default values when authentication is disabled
      const defaultUser: User = {
        id: 'dev-user',
        email: 'dev@localhost',
        name: 'Development User',
        passwordHash: '',
        plan: 'enterprise',
        credits: 999999,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      return {
        user: defaultUser,
        apiKeyId: 'dev-api-key',
      };
    }

    // Use actual user and API key when authentication is enabled
    const user = req.user!;
    const apiKey = req.apiKey!;
    
    return {
      user,
      apiKeyId: apiKey.id,
    };
  }

  /**
   * Create chat completion
   * POST /v1/chat/completions
   */
  createChatCompletion = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { user, apiKeyId } = this.getUserAndApiKey(req);

    // Use request body directly without validation
    const request = req.body;

    logger.info('Chat completion request received', {
      userId: user.id,
      apiKeyId: apiKeyId,
      model: request.model,
      messagesCount: request.messages?.length,
      hasTools: Boolean(request.tools),
      stream: request.stream,
      authDisabled: appConfig.disableAuth,
    });

    // Handle streaming vs non-streaming
    if (request.stream) {
      // TODO: Implement streaming in Phase 2
      res.status(400).json({
        error: {
          message: 'Streaming is not yet supported',
          type: 'validation_error',
          code: 'streaming_not_supported',
        },
      });
      return;
    }

    // Create completion
    const response = await this.chatService.createCompletion(request, user, apiKeyId, req.headers);

    // Set response headers
    res.set({
      'Content-Type': 'application/json',
      'X-Request-ID': req.requestId,
    });

    res.json(response);
  });

  /**
   * List available models
   * GET /v1/models
   */
  listModels = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const models = await this.chatService.getAvailableModels();

    res.json({
      object: 'list',
      data: models,
    });
  });

  /**
   * Get model information
   * GET /v1/models/:modelId
   */
  getModel = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const modelId = req.params.modelId;

    if (!modelId) {
      res.status(400).json({
        error: {
          message: 'Model ID is required',
          type: 'validation_error',
          code: 'missing_model_id',
        },
      });
      return;
    }

    const model = await this.chatService.getModelInfo(modelId);

    res.json(model);
  });

  /**
   * Estimate request cost
   * POST /v1/chat/completions/estimate
   */
  estimateCost = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const request = req.body;

    const estimate = await this.chatService.estimateRequestCost(request);

    res.json({
      success: true,
      data: estimate,
    });
  });

  /**
   * Health check for chat service
   * GET /v1/health
   */
  healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const providerHealth = await this.chatService.checkProviderHealth();

    const overallHealthy = Object.values(providerHealth).every(health => health.healthy);

    res.status(overallHealthy ? 200 : 503).json({
      success: true,
      data: {
        status: overallHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        providers: providerHealth,
      },
    });
  });

  /**
   * Get supported features
   * GET /v1/features
   */
  getFeatures = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const features = {
      chat_completions: true,
      function_calling: true,
      streaming: false, // Will be enabled in Phase 2
      vision: true,
      json_mode: true,
      multimodal: true,
      supported_models: await this.chatService.getAvailableModels(),
    };

    res.json({
      success: true,
      data: features,
    });
  });

  /**
   * Validate request format
   * POST /v1/chat/completions/validate
   */
  validateRequest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const request = req.body;

      res.json({
        success: true,
        data: {
          valid: true,
          message: 'Request is valid',
          normalized_request: request,
        },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        data: {
          valid: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        },
      });
    }
  });

  /**
   * Get usage statistics for current user
   * GET /v1/usage
   */
  getUsage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { user, apiKeyId: defaultApiKeyId } = this.getUserAndApiKey(req);
    const userId = user.id;
    const days = parseInt(req.query.days as string) || 30;
    const apiKeyId = (req.query.apiKeyId as string) || defaultApiKeyId;

    if (days < 1 || days > 365) {
      res.status(400).json({
        error: {
          message: 'Days must be between 1 and 365',
          type: 'validation_error',
          code: 'invalid_days_range',
        },
      });
      return;
    }

    // Import UsageService here to avoid circular dependency
    const { UsageService } = await import('../services/usage.service');
    const usageService = new UsageService();

    let usage;
    if (apiKeyId) {
      // Get usage for specific API key
      const logs = await usageService.getApiKeyUsageLogs(apiKeyId, {
        startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
        endDate: new Date(),
      });
      usage = logs;
    } else {
      // Get overall user usage
      usage = await usageService.getUserUsageStats(userId, days);
    }

    res.json({
      success: true,
      data: usage,
    });
  });

  /**
   * Test endpoint for development
   * POST /v1/test
   */
  test = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { user, apiKeyId } = this.getUserAndApiKey(req);

    res.json({
      success: true,
      data: {
        message: 'Test endpoint working',
        user: {
          id: user.id,
          email: user.email,
          plan: user.plan,
          credits: user.credits,
        },
        apiKey: {
          id: apiKeyId,
          name: appConfig.disableAuth ? 'Development API Key' : 'API Key',
          rateLimitRpm: appConfig.disableAuth ? 999999 : 0,
          rateLimitTpm: appConfig.disableAuth ? 999999 : 0,
        },
        authDisabled: appConfig.disableAuth,
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
      },
    });
  });
}
