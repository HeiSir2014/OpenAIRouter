/**
 * Provider configuration
 * Configuration for AI service providers (OpenAI, Anthropic, etc.)
 */

import { ProviderConfig } from '../types/provider.types.js';

/**
 * OpenAI provider configuration
 */
const openaiConfig: ProviderConfig = {
  name: 'openai',
  displayName: 'OpenAI',
  baseUrl: process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
  apiKey: process.env['OPENAI_API_KEY'] || '',
  models: [
    // Support for OpenRouter models
    'deepseek/deepseek-chat-v3.1:free',
    'deepseek/deepseek-chat',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'anthropic/claude-3.5-sonnet',
    // Original OpenAI models
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4-turbo-preview',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k',
  ],
  priority: 1,
  isActive: Boolean(process.env['OPENAI_API_KEY']),
  rateLimit: {
    requestsPerSecond: 10,
    requestsPerMinute: 500,
  },
  timeout: 30000, // 30 seconds
  retries: 3,
};

/**
 * Anthropic provider configuration
 */
const anthropicConfig: ProviderConfig = {
  name: 'anthropic',
  displayName: 'Anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  apiKey: process.env['ANTHROPIC_API_KEY'] || '',
  models: [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-2.1',
    'claude-2.0',
    'claude-instant-1.2',
  ],
  priority: 2,
  isActive: Boolean(process.env['ANTHROPIC_API_KEY']),
  rateLimit: {
    requestsPerSecond: 5,
    requestsPerMinute: 200,
  },
  timeout: 30000,
  retries: 3,
};

/**
 * All provider configurations
 */
export const PROVIDER_CONFIGS: ProviderConfig[] = [
  openaiConfig,
  anthropicConfig,
];

/**
 * Get active providers only
 */
export const getActiveProviders = (): ProviderConfig[] => {
  return PROVIDER_CONFIGS.filter(provider => provider.isActive);
};

/**
 * Get provider by name
 */
export const getProviderByName = (name: string): ProviderConfig | undefined => {
  return PROVIDER_CONFIGS.find(provider => provider.name === name);
};

/**
 * Get providers that support a specific model
 */
export const getProvidersForModel = (model: string): ProviderConfig[] => {
  return PROVIDER_CONFIGS.filter(provider => 
    provider.isActive && provider.models.includes(model)
  );
};

/**
 * Model to provider mapping
 * Maps client-requested models to specific providers
 */
export const MODEL_PROVIDER_MAP: Record<string, string> = {
  // DeepSeek models (via OpenRouter)
  'deepseek/deepseek-chat-v3.1:free': 'openai',
  'deepseek/deepseek-chat': 'openai',
  
  // OpenRouter models
  'openai/gpt-4o': 'openai',
  'openai/gpt-4o-mini': 'openai',
  'anthropic/claude-3.5-sonnet': 'openai',
  
  // Original OpenAI models
  'gpt-4': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-4-turbo-preview': 'openai',
  'gpt-3.5-turbo': 'openai',
  'gpt-3.5-turbo-16k': 'openai',
  
  // Anthropic models
  'claude-3-opus': 'anthropic',
  'claude-3-opus-20240229': 'anthropic',
  'claude-3-sonnet': 'anthropic',
  'claude-3-sonnet-20240229': 'anthropic',
  'claude-3-haiku': 'anthropic',
  'claude-3-haiku-20240307': 'anthropic',
  'claude-2.1': 'anthropic',
  'claude-2.0': 'anthropic',
  'claude-instant-1.2': 'anthropic',
  
  // Generic mappings
  'claude': 'anthropic',
  'gpt': 'openai',
};

/**
 * Get provider name for a model
 */
export const getProviderForModel = (model: string): string => {
  // Direct mapping
  if (MODEL_PROVIDER_MAP[model]) {
    return MODEL_PROVIDER_MAP[model];
  }
  
  // Fuzzy matching
  if (model.includes('gpt')) {
    return 'openai';
  }
  
  if (model.includes('claude')) {
    return 'anthropic';
  }
  
  // Default fallback
  return 'openai';
};

/**
 * Default provider selection order
 */
export const DEFAULT_PROVIDER_ORDER = ['openai', 'anthropic'];

/**
 * Get the default model from environment or fallback
 */
export const getDefaultModel = (): string => {
  const envDefault = process.env['OPENAI_DEFAULT_MODEL'];
  if (envDefault) {
    return envDefault;
  }
  
  // Fallback to first available model from active providers
  const availableModels = getAllAvailableModels();
  return availableModels.length > 0 ? availableModels[0] : 'gpt-3.5-turbo';
};

/**
 * Provider health check endpoints
 */
export const PROVIDER_HEALTH_CHECKS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/models',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

/**
 * Validate provider configurations
 */
export const validateProviderConfigs = (): void => {
  const activeProviders = getActiveProviders();
  
  if (activeProviders.length === 0) {
    throw new Error('No active providers configured. Please set API keys for at least one provider.');
  }
  
  for (const provider of activeProviders) {
    if (!provider.apiKey) {
      throw new Error(`API key not configured for provider: ${provider.name}`);
    }
    
    if (!provider.baseUrl) {
      throw new Error(`Base URL not configured for provider: ${provider.name}`);
    }
    
    if (provider.models.length === 0) {
      throw new Error(`No models configured for provider: ${provider.name}`);
    }
  }
};

/**
 * Get all available models across all active providers
 */
export const getAllAvailableModels = (): string[] => {
  const models = new Set<string>();
  
  for (const provider of getActiveProviders()) {
    for (const model of provider.models) {
      models.add(model);
    }
  }
  
  return Array.from(models).sort();
};
