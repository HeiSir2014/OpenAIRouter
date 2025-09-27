/**
 * Chat service
 * Handles chat completion requests and provider routing
 */

import { OpenAIRequest, OpenAIResponse } from '../types/openai.types.js';
import { User } from '../types/auth.types.js';
import { getProviderForModel, getAvailableProviders } from '../providers/factory.js';
import { getAllAvailableModels, getProviderForModel as getProviderNameForModel } from '../config/providers.config.js';
import { UsageService } from './usage.service.js';
import { logger } from '../utils/logger.util.js';
import { createProviderError, createValidationError } from '../middleware/error.middleware.js';

/**
 * Chat service class
 */
export class ChatService {
  private usageService = new UsageService();

  /**
   * Create chat completion
   */
  async createCompletion(
    request: OpenAIRequest,
    user: User,
    apiKeyId: string
  ): Promise<OpenAIResponse> {
    const startTime = Date.now();
    
    try {
      // Validate request
      this.validateRequest(request);

      // Determine model and provider
      const model = request.model || this.getDefaultModel();
      const providerName = getProviderNameForModel(model);
      
      logger.info('Chat completion request', {
        userId: user.id,
        apiKeyId,
        model,
        provider: providerName,
        messagesCount: request.messages?.length,
        hasTools: Boolean(request.tools),
        stream: request.stream,
      });

      // Get provider instance
      const provider = getProviderForModel(model);

      // Estimate cost and check credits
      const estimatedTokens = provider.estimateTokens(request);
      const estimatedCost = this.usageService.calculateCost(
        providerName,
        model,
        Math.floor(estimatedTokens * 0.7), // Estimate 70% prompt tokens
        Math.floor(estimatedTokens * 0.3)  // Estimate 30% completion tokens
      );

      // Check if user has sufficient credits
      const hasCredits = await this.usageService.checkUserCredits(user.id, estimatedCost);
      if (!hasCredits) {
        throw createValidationError('Insufficient credits', {
          required: estimatedCost,
          available: user.credits,
        });
      }

      // Make the completion request
      const response = await provider.chatCompletion({
        ...request,
        model, // Ensure model is set
      });

      // Calculate actual usage and cost
      const actualUsage = response.usage || {
        prompt_tokens: Math.floor(estimatedTokens * 0.7),
        completion_tokens: Math.floor(estimatedTokens * 0.3),
        total_tokens: estimatedTokens,
      };

      const actualCost = this.usageService.calculateCost(
        providerName,
        model,
        actualUsage.prompt_tokens,
        actualUsage.completion_tokens
      );

      const latency = Date.now() - startTime;

      // Log usage
      await this.usageService.logUsage({
        userId: user.id,
        apiKeyId,
        provider: providerName,
        model,
        promptTokens: actualUsage.prompt_tokens,
        completionTokens: actualUsage.completion_tokens,
        totalTokens: actualUsage.total_tokens,
        cost: actualCost,
        latency,
        success: true,
      });

      logger.info('Chat completion successful', {
        userId: user.id,
        apiKeyId,
        model,
        provider: providerName,
        latency,
        usage: actualUsage,
        cost: actualCost,
      });

      return response;
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failed usage
      try {
        await this.usageService.logUsage({
          userId: user.id,
          apiKeyId,
          provider: request.model ? getProviderNameForModel(request.model) : 'unknown',
          model: request.model || 'unknown',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          latency,
          success: false,
          errorMessage,
        });
      } catch (logError) {
        logger.warn('Failed to log error usage', { logError });
      }

      logger.error('Chat completion failed', {
        userId: user.id,
        apiKeyId,
        model: request.model,
        error: errorMessage,
        latency,
      });

      throw error;
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels(): Promise<Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>> {
    try {
      const models = getAllAvailableModels();
      
      return models.map(model => ({
        id: model,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: getProviderNameForModel(model),
      }));
    } catch (error) {
      logger.error('Failed to get available models', { error });
      throw error;
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(modelId: string): Promise<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    context_length?: number;
    supports_functions?: boolean;
    supports_vision?: boolean;
  }> {
    try {
      const providerName = getProviderNameForModel(modelId);
      const provider = getProviderForModel(modelId);
      
      // Get model-specific information if provider supports it
      let modelInfo = {};
      if ('getModelInfo' in provider && typeof provider.getModelInfo === 'function') {
        modelInfo = (provider as any).getModelInfo(modelId);
      }

      return {
        id: modelId,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: providerName,
        ...modelInfo,
      };
    } catch (error) {
      logger.error('Failed to get model info', { error, modelId });
      throw error;
    }
  }

  /**
   * Check provider health
   */
  async checkProviderHealth(): Promise<Record<string, {
    healthy: boolean;
    latency: number;
    error?: string;
  }>> {
    try {
      const availableProviders = getAvailableProviders();
      const healthResults: Record<string, any> = {};

      const healthChecks = availableProviders.map(async (providerName) => {
        try {
          const provider = getProviderForModel(providerName);
          const health = await provider.getHealth();
          healthResults[providerName] = health;
        } catch (error) {
          healthResults[providerName] = {
            healthy: false,
            latency: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      await Promise.all(healthChecks);
      return healthResults;
    } catch (error) {
      logger.error('Failed to check provider health', { error });
      throw error;
    }
  }

  /**
   * Validate chat completion request
   */
  private validateRequest(request: OpenAIRequest): void {
    // Basic validation
    if (!request.messages && !request.prompt) {
      throw createValidationError('Either messages or prompt is required');
    }

    if (request.messages && !Array.isArray(request.messages)) {
      throw createValidationError('Messages must be an array');
    }

    if (request.messages && request.messages.length === 0) {
      throw createValidationError('Messages array cannot be empty');
    }

    // Validate messages structure
    if (request.messages) {
      for (let i = 0; i < request.messages.length; i++) {
        const message = request.messages[i];
        
        if (!message.role) {
          throw createValidationError(`Message at index ${i} is missing role`);
        }

        if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
          throw createValidationError(`Invalid role at index ${i}: ${message.role}`);
        }

        if (message.content === undefined || message.content === null) {
          if (message.role !== 'assistant' || !message.tool_calls) {
            throw createValidationError(`Message at index ${i} is missing content`);
          }
        }

        // Validate tool calls
        if (message.tool_calls) {
          if (!Array.isArray(message.tool_calls)) {
            throw createValidationError(`Tool calls at index ${i} must be an array`);
          }

          for (const toolCall of message.tool_calls) {
            if (!toolCall.id || !toolCall.function?.name) {
              throw createValidationError(`Invalid tool call structure at index ${i}`);
            }
          }
        }

        // Validate tool message
        if (message.role === 'tool') {
          if (!message.tool_call_id) {
            throw createValidationError(`Tool message at index ${i} is missing tool_call_id`);
          }
        }
      }
    }

    // Validate model
    if (request.model) {
      const availableModels = getAllAvailableModels();
      if (!availableModels.includes(request.model)) {
        throw createValidationError(`Model not available: ${request.model}`, {
          provided: request.model,
          available: availableModels,
        });
      }
    }

    // Validate parameters
    if (request.max_tokens !== undefined) {
      if (!Number.isInteger(request.max_tokens) || request.max_tokens < 1) {
        throw createValidationError('max_tokens must be a positive integer');
      }
      if (request.max_tokens > 100000) {
        throw createValidationError('max_tokens cannot exceed 100000');
      }
    }

    if (request.temperature !== undefined) {
      if (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 2) {
        throw createValidationError('temperature must be a number between 0 and 2');
      }
    }

    if (request.top_p !== undefined) {
      if (typeof request.top_p !== 'number' || request.top_p <= 0 || request.top_p > 1) {
        throw createValidationError('top_p must be a number between 0 and 1');
      }
    }

    if (request.n !== undefined) {
      if (!Number.isInteger(request.n) || request.n < 1 || request.n > 10) {
        throw createValidationError('n must be an integer between 1 and 10');
      }
    }

    // Validate tools
    if (request.tools) {
      if (!Array.isArray(request.tools)) {
        throw createValidationError('tools must be an array');
      }

      for (let i = 0; i < request.tools.length; i++) {
        const tool = request.tools[i];
        
        if (tool.type !== 'function') {
          throw createValidationError(`Tool at index ${i} must have type 'function'`);
        }

        if (!tool.function?.name) {
          throw createValidationError(`Tool at index ${i} is missing function name`);
        }

        if (!tool.function?.parameters) {
          throw createValidationError(`Tool at index ${i} is missing function parameters`);
        }
      }
    }

    // Validate tool choice
    if (request.tool_choice) {
      if (typeof request.tool_choice === 'string') {
        if (!['none', 'auto'].includes(request.tool_choice)) {
          throw createValidationError('tool_choice string must be "none" or "auto"');
        }
      } else if (typeof request.tool_choice === 'object') {
        if (request.tool_choice.type !== 'function') {
          throw createValidationError('tool_choice object must have type "function"');
        }
        if (!request.tool_choice.function?.name) {
          throw createValidationError('tool_choice function must have a name');
        }
      } else {
        throw createValidationError('tool_choice must be a string or object');
      }
    }
  }

  /**
   * Get default model
   */
  private getDefaultModel(): string {
    const availableModels = getAllAvailableModels();
    
    // Prefer GPT-3.5-turbo if available
    if (availableModels.includes('gpt-3.5-turbo')) {
      return 'gpt-3.5-turbo';
    }

    // Otherwise use first available model
    if (availableModels.length > 0) {
      return availableModels[0];
    }

    throw createProviderError('system', 'No models available');
  }

  /**
   * Estimate request cost
   */
  async estimateRequestCost(request: OpenAIRequest): Promise<{
    estimatedTokens: number;
    estimatedCost: number;
    model: string;
    provider: string;
  }> {
    try {
      const model = request.model || this.getDefaultModel();
      const providerName = getProviderNameForModel(model);
      const provider = getProviderForModel(model);

      const estimatedTokens = provider.estimateTokens(request);
      const estimatedCost = this.usageService.calculateCost(
        providerName,
        model,
        Math.floor(estimatedTokens * 0.7),
        Math.floor(estimatedTokens * 0.3)
      );

      return {
        estimatedTokens,
        estimatedCost,
        model,
        provider: providerName,
      };
    } catch (error) {
      logger.error('Failed to estimate request cost', { error, model: request.model });
      throw error;
    }
  }
}
