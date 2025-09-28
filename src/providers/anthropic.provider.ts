/**
 * Anthropic provider implementation
 * Handles requests to Anthropic's Claude API with format transformation
 */

import axios, { AxiosResponse } from 'axios';

import { BaseProvider } from './base.provider.js';
import { OpenAIRequest, OpenAIResponse, OpenAIMessage } from '../types/openai.types.js';
import { ProviderConfig } from '../types/provider.types.js';
import { logger } from '../utils/logger.util.js';
import { handleAxiosError } from '../middleware/error.middleware.js';

/**
 * Anthropic API request format
 */
interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    content:
      | string
      | Array<{
          type: 'text' | 'image';
          text?: string;
          source?: {
            type: 'base64';
            media_type: string;
            data: string;
          };
        }>;
  }>;
  system?: string;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  stream?: boolean;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
  }>;
  tool_choice?: {
    type: 'auto' | 'any' | 'tool';
    name?: string;
  };
}

/**
 * Anthropic API response format
 */
interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic provider class
 */
export class AnthropicProvider extends BaseProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  /**
   * Chat completion implementation for Anthropic
   */
  async chatCompletion(
    request: OpenAIRequest,
    userHeaders?: Record<string, string | string[] | undefined>,
  ): Promise<OpenAIResponse> {
    const startTime = Date.now();

    try {
      // Validate request
      this.validateRequest(request);

      // Transform request to Anthropic format
      const transformedRequest = this.transformRequest(request);

      // Get headers and merge with user headers
      const baseHeaders = this.getHeaders();
      const headers = this.mergeHeaders(baseHeaders, userHeaders);

      // Debug: Log headers to ensure our API key is used
      logger.debug('Anthropic request headers', {
        baseHeaders: { ...baseHeaders, 'x-api-key': '[REDACTED]' },
        userHeaders: userHeaders ? Object.keys(userHeaders) : 'none',
        finalHeaders: { ...headers, 'x-api-key': '[REDACTED]' },
      });

      // Log request (sanitized)
      logger.info('Anthropic API request', {
        provider: this.name,
        model: request.model,
        endpoint: 'messages',
        requestData: this.sanitizeForLogging(request),
      });

      // Make API request
      const response: AxiosResponse = await axios.post(
        `${this.config.baseUrl}/messages`,
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

        logger.warn('Anthropic API error response', {
          provider: this.name,
          ...response
        });

        throw new Error(errorMessage);
      }

      // Transform response to OpenAI format
      const transformedResponse = this.transformResponse(response.data);

      // Log success metrics
      const duration = Date.now() - startTime;
      this.logMetrics('chat_completion', duration, true);

      // Log detailed response information
      logger.info('Anthropic API response', {
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
   * Transform OpenAI request to Anthropic format
   */
  transformRequest(request: OpenAIRequest): AnthropicRequest {
    if (!request.messages) {
      throw new Error('Anthropic provider requires messages format');
    }

    // Extract system message
    let systemMessage = '';
    const messages: AnthropicRequest['messages'] = [];

    for (const message of request.messages) {
      if (message.role === 'system') {
        if (typeof message.content === 'string') {
          systemMessage += (systemMessage ? '\n\n' : '') + message.content;
        }
      } else if (message.role === 'user' || message.role === 'assistant') {
        messages.push(this.transformMessage(message));
      }
      // Skip tool messages for now (Anthropic handles them differently)
    }

    // Map model name
    const model = this.mapModelName(request.model || this.config.models[0]);

    const anthropicRequest: AnthropicRequest = {
      model,
      max_tokens: request.max_tokens || 1000,
      messages,
    };

    // Add system message if present
    if (systemMessage) {
      anthropicRequest.system = systemMessage;
    }

    // Add optional parameters
    if (request.temperature !== undefined) {
      anthropicRequest.temperature = request.temperature;
    }

    if (request.top_p !== undefined) {
      anthropicRequest.top_p = request.top_p;
    }

    if (request.top_k !== undefined) {
      anthropicRequest.top_k = request.top_k;
    }

    if (request.stop) {
      anthropicRequest.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    if (request.stream !== undefined) {
      anthropicRequest.stream = request.stream;
    }

    // Transform tools if present
    if (request.tools) {
      anthropicRequest.tools = request.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));

      // Transform tool choice
      if (request.tool_choice) {
        if (request.tool_choice === 'auto') {
          anthropicRequest.tool_choice = { type: 'auto' };
        } else if (request.tool_choice === 'none') {
          // Anthropic doesn't have explicit 'none', just omit tools
          delete anthropicRequest.tools;
        } else if (typeof request.tool_choice === 'object') {
          anthropicRequest.tool_choice = {
            type: 'tool',
            name: request.tool_choice.function.name,
          };
        }
      }
    }

    return anthropicRequest;
  }

  /**
   * Transform individual message to Anthropic format
   */
  private transformMessage(message: OpenAIMessage): AnthropicRequest['messages'][0] {
    const role = message.role === 'user' ? 'user' : 'assistant';

    if (typeof message.content === 'string') {
      return {
        role,
        content: message.content,
      };
    }

    if (Array.isArray(message.content)) {
      const content = message.content.map(part => {
        if (part.type === 'text') {
          return {
            type: 'text' as const,
            text: part.text || '',
          };
        } else if (part.type === 'image_url') {
          // Convert image URL to Anthropic format
          const imageUrl = part.image_url?.url || '';

          // Handle base64 images
          if (imageUrl.startsWith('data:')) {
            const [header, data] = imageUrl.split(',');
            const mediaType = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';

            return {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: mediaType,
                data,
              },
            };
          }

          // For URL images, we'd need to fetch and convert to base64
          // For now, convert to text description
          return {
            type: 'text' as const,
            text: `[Image: ${imageUrl}]`,
          };
        }

        return {
          type: 'text' as const,
          text: JSON.stringify(part),
        };
      });

      return {
        role,
        content,
      };
    }

    // Fallback for null or other content types
    return {
      role,
      content: message.content || '',
    };
  }

  /**
   * Transform Anthropic response to OpenAI format
   */
  transformResponse(response: AnthropicResponse): OpenAIResponse {
    // Extract text content and tool calls
    let content = '';
    const toolCalls: any[] = [];

    for (const item of response.content) {
      if (item.type === 'text') {
        content += item.text || '';
      } else if (item.type === 'tool_use') {
        toolCalls.push({
          id: item.id || `call_${Date.now()}`,
          type: 'function',
          function: {
            name: item.name || '',
            arguments: JSON.stringify(item.input || {}),
          },
        });
      }
    }

    // Map finish reason
    const finishReason = this.mapFinishReason(response.stop_reason);

    const choice = {
      index: 0,
      message: {
        role: 'assistant' as const,
        content: content || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      finish_reason: finishReason,
    };

    return {
      id: response.id,
      object: 'chat.completion' as const,
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [choice],
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  /**
   * Get headers for Anthropic API requests
   */
  getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'User-Agent': 'OpenAI-Router/1.0.0',
    };
  }

  /**
   * Map OpenAI model names to Anthropic model names
   */
  private mapModelName(model: string): string {
    const modelMap: Record<string, string> = {
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307',
      claude: 'claude-3-sonnet-20240229', // Default
    };

    return modelMap[model] || model;
  }

  /**
   * Map Anthropic finish reasons to OpenAI format
   */
  private mapFinishReason(stopReason: string): string {
    const reasonMap: Record<string, string> = {
      end_turn: 'stop',
      max_tokens: 'length',
      stop_sequence: 'stop',
      tool_use: 'tool_calls',
    };

    return reasonMap[stopReason] || 'stop';
  }

  /**
   * Validate Anthropic-specific request parameters
   */
  override validateRequest(request: OpenAIRequest): boolean {
    // Call parent validation first
    super.validateRequest(request);

    // Anthropic-specific validations
    if (!request.messages) {
      throw new Error('Anthropic provider requires messages format (not prompt)');
    }

    // Check for unsupported parameters
    if (request.logit_bias) {
      throw new Error('logit_bias is not supported by Anthropic');
    }

    if (request.n && request.n > 1) {
      throw new Error('Anthropic does not support multiple completions (n > 1)');
    }

    if (request.presence_penalty !== undefined) {
      throw new Error('presence_penalty is not supported by Anthropic');
    }

    if (request.frequency_penalty !== undefined) {
      throw new Error('frequency_penalty is not supported by Anthropic');
    }

    // Validate max_tokens is required for Anthropic
    if (!request.max_tokens) {
      throw new Error('max_tokens is required for Anthropic');
    }

    if (request.max_tokens > 4096) {
      throw new Error('max_tokens cannot exceed 4096 for Anthropic');
    }

    return true;
  }

  /**
   * Get Anthropic-specific model information
   */
  getModelInfo(model: string): {
    contextLength: number;
    supportsFunctions: boolean;
    supportsVision: boolean;
  } {
    const modelInfo: Record<string, any> = {
      'claude-3-opus-20240229': {
        contextLength: 200000,
        supportsFunctions: true,
        supportsVision: true,
      },
      'claude-3-sonnet-20240229': {
        contextLength: 200000,
        supportsFunctions: true,
        supportsVision: true,
      },
      'claude-3-haiku-20240307': {
        contextLength: 200000,
        supportsFunctions: true,
        supportsVision: true,
      },
      'claude-2.1': {
        contextLength: 200000,
        supportsFunctions: false,
        supportsVision: false,
      },
      'claude-2.0': {
        contextLength: 100000,
        supportsFunctions: false,
        supportsVision: false,
      },
      'claude-instant-1.2': {
        contextLength: 100000,
        supportsFunctions: false,
        supportsVision: false,
      },
    };

    return (
      modelInfo[model] || {
        contextLength: 100000,
        supportsFunctions: false,
        supportsVision: false,
      }
    );
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
        if (lowerKey === 'x-api-key' || lowerKey === 'authorization') {
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
