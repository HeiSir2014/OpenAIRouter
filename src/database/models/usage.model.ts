/**
 * Usage model
 * Database operations for usage logging and statistics
 */

import { DatabaseConnection } from '../connection.js';
import { UsageLog, CreateUsageLogData } from '../../types/common.types.js';
import { generateUuid } from '../../utils/crypto.util.js';
import { logger } from '../../utils/logger.util.js';

/**
 * Usage model class
 */
export class UsageModel {
  private db = DatabaseConnection.getInstance();

  /**
   * Create a new usage log entry
   */
  async create(logData: CreateUsageLogData): Promise<UsageLog> {
    const id = generateUuid();
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO usage_logs (
          id, user_id, api_key_id, provider, model,
          prompt_tokens, completion_tokens, total_tokens,
          cost, latency, success, error_message, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        logData.userId,
        logData.apiKeyId,
        logData.provider,
        logData.model,
        logData.promptTokens,
        logData.completionTokens,
        logData.totalTokens,
        logData.cost || 0,
        logData.latency || 0,
        logData.success !== false ? 1 : 0,
        logData.errorMessage || null,
        now
      );

      const usageLog = await this.findById(id);
      if (!usageLog) {
        throw new Error('Failed to create usage log');
      }

      return usageLog;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new Error('User or API key not found');
      }
      logger.error('Failed to create usage log', { error, logData });
      throw error;
    }
  }

  /**
   * Find usage log by ID
   */
  async findById(id: string): Promise<UsageLog | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM usage_logs WHERE id = ?');
      const row = stmt.get(id) as any;

      return row ? this.mapRowToUsageLog(row) : null;
    } catch (error) {
      logger.error('Failed to find usage log by ID', { error, usageLogId: id });
      throw error;
    }
  }

  /**
   * Get usage logs for a user
   */
  async findByUserId(
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
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      provider,
      model,
      success,
    } = options;

    try {
      const offset = (page - 1) * limit;
      const conditions: string[] = ['user_id = ?'];
      const params: any[] = [userId];

      if (startDate) {
        conditions.push('created_at >= ?');
        params.push(startDate.toISOString());
      }

      if (endDate) {
        conditions.push('created_at <= ?');
        params.push(endDate.toISOString());
      }

      if (provider) {
        conditions.push('provider = ?');
        params.push(provider);
      }

      if (model) {
        conditions.push('model = ?');
        params.push(model);
      }

      if (success !== undefined) {
        conditions.push('success = ?');
        params.push(success ? 1 : 0);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get total count
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as total FROM usage_logs ${whereClause}
      `);
      const { total } = countStmt.get(...params) as { total: number };

      // Get logs
      const stmt = this.db.prepare(`
        SELECT * FROM usage_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(...params, limit, offset) as any[];
      const logs = rows.map(row => this.mapRowToUsageLog(row));

      return { logs, total };
    } catch (error) {
      logger.error('Failed to find usage logs by user ID', { error, userId, options });
      throw error;
    }
  }

  /**
   * Get usage logs for an API key
   */
  async findByApiKeyId(
    apiKeyId: string,
    options: {
      page?: number;
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ logs: UsageLog[]; total: number }> {
    const { page = 1, limit = 50, startDate, endDate } = options;

    try {
      const offset = (page - 1) * limit;
      const conditions: string[] = ['api_key_id = ?'];
      const params: any[] = [apiKeyId];

      if (startDate) {
        conditions.push('created_at >= ?');
        params.push(startDate.toISOString());
      }

      if (endDate) {
        conditions.push('created_at <= ?');
        params.push(endDate.toISOString());
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get total count
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as total FROM usage_logs ${whereClause}
      `);
      const { total } = countStmt.get(...params) as { total: number };

      // Get logs
      const stmt = this.db.prepare(`
        SELECT * FROM usage_logs 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(...params, limit, offset) as any[];
      const logs = rows.map(row => this.mapRowToUsageLog(row));

      return { logs, total };
    } catch (error) {
      logger.error('Failed to find usage logs by API key ID', { error, apiKeyId, options });
      throw error;
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUserStats(userId: string, days: number = 30): Promise<any> {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_requests,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost), 0) as total_cost,
          COALESCE(AVG(latency), 0) as avg_latency,
          COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*) as success_rate,
          provider,
          model,
          COUNT(*) as request_count
        FROM usage_logs
        WHERE user_id = ? 
          AND created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY provider, model
        ORDER BY request_count DESC
      `);

      const providerStats = stmt.all(userId, days) as any[];

      // Get overall stats
      const overallStmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_requests,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost), 0) as total_cost,
          COALESCE(AVG(latency), 0) as avg_latency,
          COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM usage_logs
        WHERE user_id = ? 
          AND created_at >= datetime('now', '-' || ? || ' days')
      `);

      const overall = overallStmt.get(userId, days) as any;

      // Get daily usage
      const dailyStmt = this.db.prepare(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as requests,
          COALESCE(SUM(total_tokens), 0) as tokens,
          COALESCE(SUM(cost), 0) as cost
        FROM usage_logs
        WHERE user_id = ? 
          AND created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      const dailyUsage = dailyStmt.all(userId, days) as any[];

      return {
        overall: {
          totalRequests: overall?.total_requests || 0,
          totalTokens: overall?.total_tokens || 0,
          totalCost: overall?.total_cost || 0,
          averageLatency: overall?.avg_latency || 0,
          successRate: overall?.success_rate || 100,
        },
        byProvider: providerStats.map(stat => ({
          provider: stat.provider,
          model: stat.model,
          requests: stat.request_count,
          tokens: stat.total_tokens,
          cost: stat.total_cost,
        })),
        dailyUsage: dailyUsage.map(day => ({
          date: day.date,
          requests: day.requests,
          tokens: day.tokens,
          cost: day.cost,
        })),
      };
    } catch (error) {
      logger.error('Failed to get user usage stats', { error, userId, days });
      throw error;
    }
  }

  /**
   * Get system-wide usage statistics
   */
  async getSystemStats(days: number = 30): Promise<any> {
    try {
      // Overall stats
      const overallStmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_requests,
          COUNT(DISTINCT user_id) as unique_users,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(cost), 0) as total_cost,
          COALESCE(AVG(latency), 0) as avg_latency,
          COUNT(CASE WHEN success = 1 THEN 1 END) * 100.0 / COUNT(*) as success_rate
        FROM usage_logs
        WHERE created_at >= datetime('now', '-' || ? || ' days')
      `);

      const overall = overallStmt.get(days) as any;

      // Top providers
      const providerStmt = this.db.prepare(`
        SELECT 
          provider,
          COUNT(*) as requests,
          COALESCE(SUM(total_tokens), 0) as tokens,
          COALESCE(SUM(cost), 0) as cost
        FROM usage_logs
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY provider
        ORDER BY requests DESC
        LIMIT 10
      `);

      const topProviders = providerStmt.all(days) as any[];

      // Top models
      const modelStmt = this.db.prepare(`
        SELECT 
          model,
          provider,
          COUNT(*) as requests,
          COALESCE(SUM(total_tokens), 0) as tokens
        FROM usage_logs
        WHERE created_at >= datetime('now', '-' || ? || ' days')
        GROUP BY model, provider
        ORDER BY requests DESC
        LIMIT 10
      `);

      const topModels = modelStmt.all(days) as any[];

      return {
        overall: {
          totalRequests: overall?.total_requests || 0,
          uniqueUsers: overall?.unique_users || 0,
          totalTokens: overall?.total_tokens || 0,
          totalCost: overall?.total_cost || 0,
          averageLatency: overall?.avg_latency || 0,
          successRate: overall?.success_rate || 100,
        },
        topProviders,
        topModels,
      };
    } catch (error) {
      logger.error('Failed to get system usage stats', { error, days });
      throw error;
    }
  }

  /**
   * Delete old usage logs
   */
  async cleanup(olderThanDays: number = 90): Promise<number> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM usage_logs 
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `);

      const result = stmt.run(olderThanDays);
      
      if (result.changes > 0) {
        logger.info('Usage logs cleaned up', { 
          deletedCount: result.changes, 
          olderThanDays 
        });
      }

      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup usage logs', { error, olderThanDays });
      throw error;
    }
  }

  /**
   * Map database row to UsageLog object
   */
  private mapRowToUsageLog(row: any): UsageLog {
    return {
      id: row.id,
      userId: row.user_id,
      apiKeyId: row.api_key_id,
      provider: row.provider,
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      cost: row.cost,
      latency: row.latency,
      success: Boolean(row.success),
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
    };
  }
}
