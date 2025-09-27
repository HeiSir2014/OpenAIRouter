/**
 * Base provider abstract class
 * Defines the interface for all AI service providers
 */

import { OpenAIRequest, OpenAIResponse } from '../types/openai.types.js';
import { ProviderConfig, IProvider } from '../types/provider.types.js';
import { logger } from '../utils/logger.util.js';

/**
 * Abstract base provider class
 * All provider implementations must extend this class
 */
export abstract class BaseProvider implements IProvider {
  public readonly name: string;
  public readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.name = config.name;
    this.config = config;
  }

  /**
   * Main chat completion method
   * Must be implemented by each provider
   */
  abstract chatCompletion(request: OpenAIRequest): Promise<OpenAIResponse>;

  /**
   * Transform OpenAI request to provider-specific format
   * Must be implemented by each provider
   */
  abstract transformRequest(request: OpenAIRequest): unknown;

  /**
   * Transform provider response to OpenAI format
   * Must be implemented by each provider
   */
  abstract transformResponse(response: unknown): OpenAIResponse;

  /**
   * Get HTTP headers for provider requests
   * Must be implemented by each provider
   */
  abstract getHeaders(): Record<string, string>;

  /**
   * Validate request before processing
   * Can be overridden by providers for custom validation
   */
  validateRequest(request: OpenAIRequest): boolean {
    // Basic validation
    if (!request.messages && !request.prompt) {
      throw new Error('Either messages or prompt is required');
    }

    if (request.messages && !Array.isArray(request.messages)) {
      throw new Error('Messages must be an array');
    }

    if (request.messages && request.messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    // Validate model if specified
    if (request.model && !this.config.models.includes(request.model)) {
      throw new Error(`Model ${request.model} not supported by provider ${this.name}`);
    }

    // Validate token limits
    if (request.max_tokens && request.max_tokens < 1) {
      throw new Error('max_tokens must be greater than 0');
    }

    if (request.max_tokens && request.max_tokens > 100000) {
      throw new Error('max_tokens cannot exceed 100000');
    }

    // Validate temperature
    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        throw new Error('temperature must be between 0 and 2');
      }
    }

    // Validate top_p
    if (request.top_p !== undefined) {
      if (request.top_p <= 0 || request.top_p > 1) {
        throw new Error('top_p must be between 0 and 1');
      }
    }

    return true;
  }

  /**
   * Handle provider-specific errors
   * Can be overridden by providers for custom error handling
   */
  handleError(error: unknown): Error {
    if (error instanceof Error) {
      logger.error(`Provider ${this.name} error`, {
        provider: this.name,
        error: error.message,
        stack: error.stack,
      });
      return error;
    }

    const errorMessage = typeof error === 'string' ? error : 'Unknown provider error';
    const providerError = new Error(`Provider ${this.name}: ${errorMessage}`);
    
    logger.error(`Provider ${this.name} error`, {
      provider: this.name,
      error: errorMessage,
    });

    return providerError;
  }

  /**
   * Get provider health status
   */
  async getHealth(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Simple health check with minimal request
      const testRequest: OpenAIRequest = {
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      };

      await this.chatCompletion(testRequest);
      
      return {
        healthy: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get supported models for this provider
   */
  getSupportedModels(): string[] {
    return [...this.config.models];
  }

  /**
   * Check if a model is supported
   */
  supportsModel(model: string): boolean {
    return this.config.models.includes(model);
  }

  /**
   * Get provider configuration
   */
  getConfig(): ProviderConfig {
    // Return a copy to prevent modification
    return { ...this.config };
  }

  /**
   * Check if provider is active
   */
  isActive(): boolean {
    return this.config.isActive;
  }

  /**
   * Get provider display name
   */
  getDisplayName(): string {
    return this.config.displayName || this.name;
  }

  /**
   * Get rate limit information
   */
  getRateLimit(): { requestsPerSecond: number; requestsPerMinute: number } {
    return { ...this.config.rateLimit };
  }

  /**
   * Estimate token count for a request
   * Basic implementation, can be overridden by providers
   */
  estimateTokens(request: OpenAIRequest): number {
    let tokenCount = 0;

    // Estimate based on messages
    if (request.messages) {
      for (const message of request.messages) {
        if (typeof message.content === 'string') {
          // Rough estimation: 1 token per 4 characters
          tokenCount += Math.ceil(message.content.length / 4);
        }
      }
    }

    // Estimate based on prompt
    if (request.prompt) {
      tokenCount += Math.ceil(request.prompt.length / 4);
    }

    // Add estimated completion tokens
    const maxTokens = request.max_tokens || 1000;
    tokenCount += maxTokens;

    return tokenCount;
  }

  /**
   * Log provider metrics
   */
  protected logMetrics(
    operation: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    logger.info('Provider metrics', {
      provider: this.name,
      operation,
      duration,
      success,
      error,
    });
  }

  /**
   * Create standardized error response
   */
  protected createErrorResponse(
    error: string,
    type: string = 'provider_error',
    code: string = 'provider_request_failed'
  ): never {
    throw new Error(`${this.name}: ${error}`);
  }

  /**
   * Sanitize request data for logging
   */
  protected sanitizeForLogging(request: OpenAIRequest): Partial<OpenAIRequest> {
    return {
      model: request.model,
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      top_p: request.top_p,
      stream: request.stream,
      messagesCount: request.messages?.length,
      promptLength: request.prompt?.length,
    } as any;
  }
}
