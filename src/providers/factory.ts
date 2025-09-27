/**
 * Provider factory
 * Creates and manages provider instances
 */

import { BaseProvider } from './base.provider.js';
import { OpenAIProvider } from './openai.provider.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { IProvider, IProviderFactory, ProviderConfig } from '../types/provider.types.js';
import { getProviderByName, getActiveProviders } from '../config/providers.config.js';
import { logger } from '../utils/logger.util.js';

/**
 * Provider factory class
 */
export class ProviderFactory implements IProviderFactory {
  private static instance: ProviderFactory;
  private providers: Map<string, IProvider> = new Map();

  /**
   * Get singleton instance
   */
  public static getInstance(): ProviderFactory {
    if (!ProviderFactory.instance) {
      ProviderFactory.instance = new ProviderFactory();
    }
    return ProviderFactory.instance;
  }

  /**
   * Create provider instance
   */
  create(providerName: string): IProvider {
    // Check if provider is already cached
    if (this.providers.has(providerName)) {
      const provider = this.providers.get(providerName)!;
      
      // Verify provider is still active
      if (provider.isActive()) {
        return provider;
      } else {
        // Remove inactive provider from cache
        this.providers.delete(providerName);
      }
    }

    // Get provider configuration
    const config = getProviderByName(providerName);
    if (!config) {
      throw new Error(`Provider configuration not found: ${providerName}`);
    }

    if (!config.isActive) {
      throw new Error(`Provider is not active: ${providerName}`);
    }

    // Create provider instance
    const provider = this.createProviderInstance(config);
    
    // Cache the provider
    this.providers.set(providerName, provider);
    
    logger.info('Provider instance created', {
      provider: providerName,
      models: config.models.length,
    });

    return provider;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): string[] {
    return getActiveProviders().map(config => config.name);
  }

  /**
   * Check if provider is available
   */
  isProviderAvailable(providerName: string): boolean {
    const config = getProviderByName(providerName);
    return config !== undefined && config.isActive;
  }

  /**
   * Get all provider instances (active only)
   */
  getAllProviders(): IProvider[] {
    const activeProviders = getActiveProviders();
    const providers: IProvider[] = [];

    for (const config of activeProviders) {
      try {
        const provider = this.create(config.name);
        providers.push(provider);
      } catch (error) {
        logger.warn('Failed to create provider instance', {
          provider: config.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return providers;
  }

  /**
   * Get provider by model
   */
  getProviderForModel(model: string): IProvider {
    const activeProviders = getActiveProviders();
    
    // Find provider that supports the model
    for (const config of activeProviders) {
      if (config.models.includes(model)) {
        return this.create(config.name);
      }
    }

    // If no exact match, try fuzzy matching
    for (const config of activeProviders) {
      if (model.includes(config.name)) {
        return this.create(config.name);
      }
    }

    // Default to first available provider
    if (activeProviders.length > 0) {
      logger.warn('No provider found for model, using default', {
        model,
        defaultProvider: activeProviders[0].name,
      });
      return this.create(activeProviders[0].name);
    }

    throw new Error(`No active providers available for model: ${model}`);
  }

  /**
   * Get providers that support a specific model
   */
  getProvidersForModel(model: string): IProvider[] {
    const activeProviders = getActiveProviders();
    const supportingProviders: IProvider[] = [];

    for (const config of activeProviders) {
      if (config.models.includes(model)) {
        try {
          const provider = this.create(config.name);
          supportingProviders.push(provider);
        } catch (error) {
          logger.warn('Failed to create provider for model', {
            provider: config.name,
            model,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return supportingProviders;
  }

  /**
   * Health check all providers
   */
  async healthCheck(): Promise<Record<string, { healthy: boolean; latency: number; error?: string }>> {
    const providers = this.getAllProviders();
    const results: Record<string, any> = {};

    const healthChecks = providers.map(async (provider) => {
      try {
        const health = await provider.getHealth();
        results[provider.name] = health;
      } catch (error) {
        results[provider.name] = {
          healthy: false,
          latency: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    await Promise.all(healthChecks);
    return results;
  }

  /**
   * Clear provider cache
   */
  clearCache(): void {
    this.providers.clear();
    logger.info('Provider cache cleared');
  }

  /**
   * Get cached provider count
   */
  getCachedProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Create provider instance based on configuration
   */
  private createProviderInstance(config: ProviderConfig): IProvider {
    switch (config.name) {
      case 'openai':
        return new OpenAIProvider(config);
      
      case 'anthropic':
        return new AnthropicProvider(config);
      
      default:
        throw new Error(`Unknown provider type: ${config.name}`);
    }
  }

  /**
   * Validate provider configuration
   */
  private validateProviderConfig(config: ProviderConfig): void {
    if (!config.name) {
      throw new Error('Provider name is required');
    }

    if (!config.apiKey) {
      throw new Error(`API key is required for provider: ${config.name}`);
    }

    if (!config.baseUrl) {
      throw new Error(`Base URL is required for provider: ${config.name}`);
    }

    if (!config.models || config.models.length === 0) {
      throw new Error(`Models list is required for provider: ${config.name}`);
    }
  }
}

/**
 * Convenience function to create provider
 */
export const createProvider = (providerName: string): IProvider => {
  return ProviderFactory.getInstance().create(providerName);
};

/**
 * Convenience function to get provider for model
 */
export const getProviderForModel = (model: string): IProvider => {
  return ProviderFactory.getInstance().getProviderForModel(model);
};

/**
 * Convenience function to get all available providers
 */
export const getAvailableProviders = (): string[] => {
  return ProviderFactory.getInstance().getAvailableProviders();
};

/**
 * Convenience function to check provider health
 */
export const checkProviderHealth = async (): Promise<Record<string, any>> => {
  return ProviderFactory.getInstance().healthCheck();
};

/**
 * Initialize provider factory
 */
export const initializeProviders = (): void => {
  const factory = ProviderFactory.getInstance();
  const availableProviders = factory.getAvailableProviders();
  
  logger.info('Provider factory initialized', {
    availableProviders,
    count: availableProviders.length,
  });

  if (availableProviders.length === 0) {
    logger.warn('No active providers configured');
  }
};
