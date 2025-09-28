/**
 * Provider-related type definitions
 */

import { OpenAIRequest, OpenAIResponse } from './openai.types.js';

export interface ProviderConfig {
  name: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  priority: number;
  isActive: boolean;
  rateLimit: {
    requestsPerSecond: number;
    requestsPerMinute: number;
  };
  timeout: number;
  retries: number;
}

export interface ProviderRequest {
  originalRequest: OpenAIRequest;
  transformedRequest: unknown;
  provider: string;
  model: string;
  userId: string;
  apiKeyId: string;
}

export interface ProviderResponse {
  originalResponse: unknown;
  transformedResponse: OpenAIResponse;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: number;
  latency: number;
}

export interface ProviderError {
  provider: string;
  error: Error;
  statusCode?: number;
  retryable: boolean;
}

export interface ProviderHealth {
  provider: string;
  isHealthy: boolean;
  latency: number;
  lastChecked: Date;
  errorRate: number;
}

export interface ModelMapping {
  clientModel: string;
  providerModel: string;
  provider: string;
}

export interface ProviderStats {
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  errorRate: number;
  lastRequest: Date;
}

// Abstract base provider interface
export interface IProvider {
  name: string;
  config: ProviderConfig;

  chatCompletion(
    request: OpenAIRequest,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<OpenAIResponse>;
  transformRequest(request: OpenAIRequest): unknown;
  transformResponse(response: unknown): OpenAIResponse;
  getHeaders(): Record<string, string>;
  validateRequest(request: OpenAIRequest): boolean;
  handleError(error: unknown): Error;
  getHealth(): Promise<{ healthy: boolean; latency: number; error?: string }>;
  isActive(): boolean;
  estimateTokens(request: OpenAIRequest): number;
}

// Provider factory interface
export interface IProviderFactory {
  create(providerName: string): IProvider;
  getAvailableProviders(): string[];
  isProviderAvailable(providerName: string): boolean;
}

// Provider selection strategy
export interface IProviderSelector {
  selectProvider(
    model: string,
    availableProviders: ProviderConfig[],
    userPreferences?: ProviderPreferences,
  ): ProviderConfig;
}

export interface ProviderPreferences {
  preferredProviders?: string[];
  excludedProviders?: string[];
  prioritizeCost?: boolean;
  prioritizeLatency?: boolean;
  maxCostPerToken?: number;
}

export interface ProviderMetrics {
  provider: string;
  timestamp: Date;
  requestCount: number;
  errorCount: number;
  averageLatency: number;
  totalCost: number;
}
