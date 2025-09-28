/**
 * OpenAI provider implementation
 * Handles requests to OpenAI's API with direct passthrough
 */

import axios, { AxiosResponse } from 'axios';

import { BaseProvider } from './base.provider.js';
import { OpenAIRequest, OpenAIResponse } from '../types/openai.types.js';
import { ProviderConfig } from '../types/provider.types.js';
import { logger } from '../utils/logger.util.js';
import { handleAxiosError } from '../middleware/error.middleware.js';

/**
 * OpenAI provider class
 */
export class OpenAIProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Chat completion implementation for OpenAI
   */
  async chatCompletion(
    request: OpenAIRequest,
    userHeaders?: Record<string, string | string[] | undefined>,
  ): Promise<OpenAIResponse> {
    const startTime = Date.now();

    try {
      // Validate request
      this.validateRequest(request);

      // Transform request (mostly passthrough for OpenAI)
      const transformedRequest = this.transformRequest(request);

      // Get headers and merge with user headers
      const baseHeaders = this.getHeaders();
      const headers = this.mergeHeaders(baseHeaders, userHeaders);

      // Debug: Log headers to ensure our API key is used
      logger.debug('OpenAI request headers', {
        baseHeaders: { ...baseHeaders, Authorization: 'Bearer [REDACTED]' },
        userHeaders: userHeaders ? Object.keys(userHeaders) : 'none',
        finalHeaders: { ...headers, Authorization: 'Bearer [REDACTED]' },
      });

      // Log request (sanitized)
      logger.info('OpenAI API request', {
        provider: this.name,
        model: request.model,
        endpoint: 'chat/completions',
        requestData: this.sanitizeForLogging(request),
      });

      // Make API request
      const response: AxiosResponse = await axios.post(
        `${this.config.baseUrl}/chat/completions`,
        transformedRequest,
        {
          headers,
          timeout: this.config.timeout,
          validateStatus: status => status < 500, // Don't throw on 4xx errors
        },
      );

      // Handle non-2xx responses
      if (response.status >= 400) {
        const errorData = response.data;
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;

        logger.warn('OpenAI API error response', {
          provider: this.name,
          ...response,
        });

        throw new Error(errorMessage);
      }

      // Transform response
      const transformedResponse = this.transformResponse(response.data);

      // Log success metrics
      const duration = Date.now() - startTime;
      this.logMetrics('chat_completion', duration, true);

      // Log detailed response information
      logger.info('OpenAI API response', {
        provider: this.name,
        ...transformedResponse,
      });

      return transformedResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logMetrics(
        'chat_completion',
        duration,
        false,
        error instanceof Error ? error.message : 'Unknown error',
      );

      // Handle Axios errors
      if (axios.isAxiosError(error)) {
        throw handleAxiosError(error, this.name);
      }

      // Handle other errors
      throw this.handleError(error);
    }
  }

  /**
   * Transform OpenAI request (mostly passthrough)
   */
  transformRequest(request: OpenAIRequest): OpenAIRequest {
    // For OpenAI, we mostly pass through the request as-is
    // but we can add some normalization or filtering here

    const transformedRequest: OpenAIRequest = {
      ...request,
    };

    // Ensure model is set (use default if not specified)
    if (!transformedRequest.model) {
      transformedRequest.model = this.config.models[0] || 'gpt-3.5-turbo';
    }

    // Remove any OpenRouter-specific parameters that OpenAI doesn't support
    delete (transformedRequest as any).transforms;
    delete (transformedRequest as any).models;
    delete (transformedRequest as any).route;
    delete (transformedRequest as any).provider;

    // Ensure streaming is boolean if present
    if (transformedRequest.stream !== undefined) {
      transformedRequest.stream = Boolean(transformedRequest.stream);
    }

    return transformedRequest;
  }

  /**
   * Transform OpenAI response (direct passthrough)
   */
  transformResponse(response: any): OpenAIResponse {
    // OpenAI responses are already in the correct format
    // Just ensure we have all required fields

    const transformedResponse: OpenAIResponse = {
      id: response.id || `chatcmpl-${Date.now()}`,
      object: response.object || 'chat.completion',
      created: response.created || Math.floor(Date.now() / 1000),
      model: response.model || 'unknown',
      choices: response.choices || [],
      usage: response.usage,
      system_fingerprint: response.system_fingerprint,
    };

    // Ensure choices have proper structure
    transformedResponse.choices = transformedResponse.choices.map((choice: any, index: number) => ({
      index: choice.index !== undefined ? choice.index : index,
      message: choice.message || choice.delta,
      delta: choice.delta,
      finish_reason: choice.finish_reason,
      logprobs: choice.logprobs,
    }));

    return transformedResponse;
  }

  /**
   * Get headers for OpenAI API requests
   */
  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'OpenAI-Router/1.0.0',
    };

    // Add OpenAI-specific headers if needed
    if (process.env['OPENAI_ORGANIZATION']) {
      headers['OpenAI-Organization'] = process.env['OPENAI_ORGANIZATION'];
    }

    return headers;
  }

  /**
   * Validate OpenAI-specific request parameters
   */
  override validateRequest(request: OpenAIRequest): boolean {
    // Call parent validation first
    super.validateRequest(request);

    // OpenAI-specific validations
    if (request.logit_bias) {
      const biasKeys = Object.keys(request.logit_bias);
      if (biasKeys.length > 300) {
        throw new Error('logit_bias cannot have more than 300 entries');
      }

      for (const [token, bias] of Object.entries(request.logit_bias)) {
        const tokenId = parseInt(token, 10);
        if (isNaN(tokenId) || tokenId < 0) {
          throw new Error('logit_bias keys must be valid token IDs');
        }
        if (bias < -100 || bias > 100) {
          throw new Error('logit_bias values must be between -100 and 100');
        }
      }
    }

    if (request.n !== undefined) {
      if (request.n < 1 || request.n > 10) {
        throw new Error('n must be between 1 and 10');
      }
    }

    if (request.presence_penalty !== undefined) {
      if (request.presence_penalty < -2 || request.presence_penalty > 2) {
        throw new Error('presence_penalty must be between -2 and 2');
      }
    }

    if (request.frequency_penalty !== undefined) {
      if (request.frequency_penalty < -2 || request.frequency_penalty > 2) {
        throw new Error('frequency_penalty must be between -2 and 2');
      }
    }

    // Validate function calling
    if (request.tools) {
      if (!Array.isArray(request.tools)) {
        throw new Error('tools must be an array');
      }

      for (const tool of request.tools) {
        if (tool.type !== 'function') {
          throw new Error('Only function tools are supported');
        }
        if (!tool.function?.name) {
          throw new Error('Function tool must have a name');
        }
        if (!tool.function?.parameters) {
          throw new Error('Function tool must have parameters');
        }
      }
    }

    if (request.tool_choice) {
      if (typeof request.tool_choice === 'object' && request.tool_choice.type === 'function') {
        if (!request.tool_choice.function?.name) {
          throw new Error('Function tool choice must specify function name');
        }
      }
    }

    return true;
  }

  /**
   * Get OpenAI-specific model information
   */
  getModelInfo(model: string): {
    contextLength: number;
    supportsFunctions: boolean;
    supportsVision: boolean;
  } {
    const modelInfo: Record<string, any> = {
      'gpt-4': {
        contextLength: 8192,
        supportsFunctions: true,
        supportsVision: false,
      },
      'gpt-4-turbo': {
        contextLength: 128000,
        supportsFunctions: true,
        supportsVision: true,
      },
      'gpt-4-turbo-preview': {
        contextLength: 128000,
        supportsFunctions: true,
        supportsVision: true,
      },
      'gpt-3.5-turbo': {
        contextLength: 4096,
        supportsFunctions: true,
        supportsVision: false,
      },
      'gpt-3.5-turbo-16k': {
        contextLength: 16384,
        supportsFunctions: true,
        supportsVision: false,
      },
    };

    return (
      modelInfo[model] || {
        contextLength: 4096,
        supportsFunctions: false,
        supportsVision: false,
      }
    );
  }

  /**
   * Estimate tokens more accurately for OpenAI models
   */
  override estimateTokens(request: OpenAIRequest): number {
    // More accurate token estimation for OpenAI
    let tokenCount = 0;

    // Base tokens for chat format
    tokenCount += 3; // Base tokens for chat completion

    if (request.messages) {
      for (const message of request.messages) {
        tokenCount += 4; // Base tokens per message

        if (typeof message.content === 'string') {
          // More accurate estimation for OpenAI: ~0.75 tokens per word
          const words = message.content.split(/\s+/).length;
          tokenCount += Math.ceil(words * 0.75);
        } else if (Array.isArray(message.content)) {
          // Handle multimodal content
          for (const part of message.content) {
            if (part.type === 'text' && part.text) {
              const words = part.text.split(/\s+/).length;
              tokenCount += Math.ceil(words * 0.75);
            } else if (part.type === 'image_url') {
              // Image tokens depend on detail level
              const detail = part.image_url?.detail || 'auto';
              tokenCount += detail === 'high' ? 765 : 85;
            }
          }
        }

        // Add tokens for role
        tokenCount += 1;

        // Add tokens for name if present
        if (message.name) {
          tokenCount += 1;
        }

        // Add tokens for function calls
        if (message.tool_calls) {
          for (const toolCall of message.tool_calls) {
            tokenCount += 3; // Base tokens for function call
            tokenCount += Math.ceil(toolCall.function.name.length / 4);
            tokenCount += Math.ceil(toolCall.function.arguments.length / 4);
          }
        }
      }
    }

    // Add tokens for functions/tools
    if (request.tools) {
      for (const tool of request.tools) {
        tokenCount += 3; // Base tokens per function
        tokenCount += Math.ceil(tool.function.name.length / 4);
        if (tool.function.description) {
          tokenCount += Math.ceil(tool.function.description.length / 4);
        }
        // Simplified estimation for parameters schema
        tokenCount += Math.ceil(JSON.stringify(tool.function.parameters).length / 4);
      }
    }

    // Add estimated completion tokens
    const maxTokens = request.max_tokens || 1000;
    tokenCount += maxTokens;

    return tokenCount;
  }

  /**
   * Merge base headers with user headers
   * User headers take precedence over base headers
   */
  private mergeHeaders(
    baseHeaders: Record<string, string>,
    userHeaders?: Record<string, string | string[] | undefined>,
  ): Record<string, string> {
    const merged = { ...baseHeaders };

    if (userHeaders) {
      for (const [key, value] of Object.entries(userHeaders)) {
        // Skip our own auth headers to prevent conflicts
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'authorization' || lowerKey === 'x-api-key') {
          logger.debug('Skipping user auth header', { key, value: '[REDACTED]' });
          continue;
        }
        
        // Convert array values to string
        if (Array.isArray(value)) {
          merged[key] = value.join(', ');
        } else if (value !== undefined) {
          merged[key] = value;
        }
      }
    }

    // Remove any Host header from user headers to let axios set it automatically
    delete merged['Host'];
    delete merged['host'];

    return merged;
  }
}
