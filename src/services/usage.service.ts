/**
 * Usage service
 * Handles usage logging, statistics, and billing calculations
 */

import { UsageModel } from '../database/models/usage.model.js';
import { UserModel } from '../database/models/user.model.js';
import { CreateUsageLogData, UsageLog, UsageStats } from '../types/common.types.js';
import { logger, logApiUsage } from '../utils/logger.util.js';
import { createNotFoundError } from '../middleware/error.middleware.js';

/**
 * Usage service class
 */
export class UsageService {
  private usageModel = new UsageModel();
  private userModel = new UserModel();

  /**
   * Log API usage
   */
  async logUsage(logData: CreateUsageLogData): Promise<UsageLog> {
    try {
      // Calculate cost if not provided
      if (!logData.cost) {
        logData.cost = this.calculateCost(
          logData.provider,
          logData.model,
          logData.promptTokens,
          logData.completionTokens
        );
      }

      // Create usage log
      const usageLog = await this.usageModel.create(logData);

      // Log for monitoring
      logApiUsage({
        userId: logData.userId,
        apiKeyId: logData.apiKeyId,
        provider: logData.provider,
        model: logData.model,
        tokens: logData.totalTokens,
        cost: logData.cost,
        latency: logData.latency || 0,
        success: logData.success !== false,
        error: logData.errorMessage,
      });

      // Update user credits if cost > 0
      if (logData.cost > 0) {
        try {
          await this.userModel.updateCredits(logData.userId, -logData.cost);
        } catch (error) {
          logger.warn('Failed to deduct credits', {
            error,
            userId: logData.userId,
            cost: logData.cost,
          });
        }
      }

      return usageLog;
    } catch (error) {
      logger.error('Failed to log usage', { error, logData });
      throw error;
    }
  }

  /**
   * Get user usage statistics
   */
  async getUserUsageStats(userId: string, days: number = 30): Promise<UsageStats> {
    try {
      const stats = await this.usageModel.getUserStats(userId, days);

      return {
        totalRequests: stats.overall.totalRequests,
        totalTokens: stats.overall.totalTokens,
        totalCost: stats.overall.totalCost,
        averageLatency: stats.overall.averageLatency,
        successRate: stats.overall.successRate,
        topModels: stats.byProvider.map((item: any) => ({
          model: item.model,
          requests: item.requests,
          tokens: item.tokens,
        })),
        topProviders: this.aggregateByProvider(stats.byProvider),
        dailyUsage: stats.dailyUsage,
      };
    } catch (error) {
      logger.error('Failed to get user usage stats', { error, userId, days });
      throw error;
    }
  }

  /**
   * Get system-wide usage statistics
   */
  async getSystemUsageStats(days: number = 30): Promise<UsageStats> {
    try {
      const stats = await this.usageModel.getSystemStats(days);

      return {
        totalRequests: stats.overall.totalRequests,
        totalTokens: stats.overall.totalTokens,
        totalCost: stats.overall.totalCost,
        averageLatency: stats.overall.averageLatency,
        successRate: stats.overall.successRate,
        topModels: stats.topModels.map((item: any) => ({
          model: item.model,
          requests: item.requests,
          tokens: item.tokens,
        })),
        topProviders: stats.topProviders.map((item: any) => ({
          provider: item.provider,
          requests: item.requests,
          tokens: item.tokens,
        })),
        dailyUsage: [], // System daily usage would need separate query
      };
    } catch (error) {
      logger.error('Failed to get system usage stats', { error, days });
      throw error;
    }
  }

  /**
   * Get user usage logs with pagination
   */
  async getUserUsageLogs(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
      provider?: string;
      model?: string;
      success?: boolean;
    } = {}
  ): Promise<{ logs: UsageLog[]; total: number }> {
    try {
      return await this.usageModel.findByUserId(userId, options);
    } catch (error) {
      logger.error('Failed to get user usage logs', { error, userId, options });
      throw error;
    }
  }

  /**
   * Get API key usage logs with pagination
   */
  async getApiKeyUsageLogs(
    apiKeyId: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ logs: UsageLog[]; total: number }> {
    try {
      return await this.usageModel.findByApiKeyId(apiKeyId, options);
    } catch (error) {
      logger.error('Failed to get API key usage logs', { error, apiKeyId, options });
      throw error;
    }
  }

  /**
   * Calculate usage cost based on provider and model
   */
  calculateCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    const pricing = this.getModelPricing(provider, model);
    
    const promptCost = (promptTokens / 1000) * pricing.promptPrice;
    const completionCost = (completionTokens / 1000) * pricing.completionPrice;
    
    return promptCost + completionCost;
  }

  /**
   * Get model pricing information
   */
  private getModelPricing(provider: string, model: string): {
    promptPrice: number;
    completionPrice: number;
  } {
    // Pricing per 1K tokens in USD
    const pricing: Record<string, Record<string, { promptPrice: number; completionPrice: number }>> = {
      openai: {
        'gpt-4': { promptPrice: 0.03, completionPrice: 0.06 },
        'gpt-4-turbo': { promptPrice: 0.01, completionPrice: 0.03 },
        'gpt-4-turbo-preview': { promptPrice: 0.01, completionPrice: 0.03 },
        'gpt-3.5-turbo': { promptPrice: 0.0015, completionPrice: 0.002 },
        'gpt-3.5-turbo-16k': { promptPrice: 0.003, completionPrice: 0.004 },
      },
      anthropic: {
        'claude-3-opus-20240229': { promptPrice: 0.015, completionPrice: 0.075 },
        'claude-3-sonnet-20240229': { promptPrice: 0.003, completionPrice: 0.015 },
        'claude-3-haiku-20240307': { promptPrice: 0.00025, completionPrice: 0.00125 },
        'claude-2.1': { promptPrice: 0.008, completionPrice: 0.024 },
        'claude-2.0': { promptPrice: 0.008, completionPrice: 0.024 },
        'claude-instant-1.2': { promptPrice: 0.0008, completionPrice: 0.0024 },
      },
    };

    const providerPricing = pricing[provider];
    if (!providerPricing) {
      logger.warn('Unknown provider for pricing', { provider, model });
      return { promptPrice: 0.001, completionPrice: 0.002 }; // Default pricing
    }

    const modelPricing = providerPricing[model];
    if (!modelPricing) {
      logger.warn('Unknown model for pricing', { provider, model });
      // Use default pricing for the provider
      const defaultModel = Object.keys(providerPricing)[0];
      return providerPricing[defaultModel] || { promptPrice: 0.001, completionPrice: 0.002 };
    }

    return modelPricing;
  }

  /**
   * Aggregate usage statistics by provider
   */
  private aggregateByProvider(byProviderData: any[]): Array<{
    provider: string;
    requests: number;
    tokens: number;
  }> {
    const providerMap = new Map<string, { requests: number; tokens: number }>();

    for (const item of byProviderData) {
      const existing = providerMap.get(item.provider) || { requests: 0, tokens: 0 };
      existing.requests += item.requests;
      existing.tokens += item.tokens;
      providerMap.set(item.provider, existing);
    }

    return Array.from(providerMap.entries()).map(([provider, stats]) => ({
      provider,
      requests: stats.requests,
      tokens: stats.tokens,
    }));
  }

  /**
   * Get usage summary for billing
   */
  async getBillingSummary(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    breakdown: Array<{
      provider: string;
      model: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
  }> {
    try {
      const { logs } = await this.usageModel.findByUserId(userId, {
        startDate,
        endDate,
        limit: 10000, // Large limit to get all records
      });

      let totalCost = 0;
      let totalTokens = 0;
      let totalRequests = logs.length;

      const breakdown = new Map<string, {
        provider: string;
        model: string;
        requests: number;
        tokens: number;
        cost: number;
      }>();

      for (const log of logs) {
        totalCost += log.cost;
        totalTokens += log.totalTokens;

        const key = `${log.provider}:${log.model}`;
        const existing = breakdown.get(key) || {
          provider: log.provider,
          model: log.model,
          requests: 0,
          tokens: 0,
          cost: 0,
        };

        existing.requests += 1;
        existing.tokens += log.totalTokens;
        existing.cost += log.cost;

        breakdown.set(key, existing);
      }

      return {
        totalCost,
        totalTokens,
        totalRequests,
        breakdown: Array.from(breakdown.values()),
      };
    } catch (error) {
      logger.error('Failed to get billing summary', { error, userId, startDate, endDate });
      throw error;
    }
  }

  /**
   * Check if user has sufficient credits
   */
  async checkUserCredits(userId: string, estimatedCost: number): Promise<boolean> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw createNotFoundError('User');
      }

      return user.credits >= estimatedCost;
    } catch (error) {
      logger.error('Failed to check user credits', { error, userId, estimatedCost });
      throw error;
    }
  }

  /**
   * Add credits to user account
   */
  async addCredits(userId: string, amount: number, reason: string): Promise<void> {
    try {
      const user = await this.userModel.updateCredits(userId, amount);
      if (!user) {
        throw createNotFoundError('User');
      }

      logger.info('Credits added to user account', {
        userId,
        amount,
        reason,
        newBalance: user.credits,
      });
    } catch (error) {
      logger.error('Failed to add credits', { error, userId, amount, reason });
      throw error;
    }
  }

  /**
   * Clean up old usage logs
   */
  async cleanupOldLogs(olderThanDays: number = 90): Promise<number> {
    try {
      const deletedCount = await this.usageModel.cleanup(olderThanDays);
      
      logger.info('Usage logs cleanup completed', {
        deletedCount,
        olderThanDays,
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup usage logs', { error, olderThanDays });
      throw error;
    }
  }
}
