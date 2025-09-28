/**
 * API Key model
 * Database operations for API key management
 */

import { DatabaseConnection } from '../connection.js';
import { ApiKey, CreateApiKeyData } from '../../types/auth.types.js';
import { generateUuid } from '../../utils/crypto.util.js';
import { logger } from '../../utils/logger.util.js';

/**
 * API Key model class
 */
export class ApiKeyModel {
  private db = DatabaseConnection.getInstance();

  /**
   * Create a new API key
   */
  async create(keyData: CreateApiKeyData): Promise<ApiKey> {
    const id = generateUuid();
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO api_keys (
          id, user_id, key_hash, name, permissions, 
          rate_limit_rpm, rate_limit_tpm, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        keyData.userId,
        keyData.keyHash,
        keyData.name,
        JSON.stringify(keyData.permissions || []),
        keyData.rateLimitRpm || 60,
        keyData.rateLimitTpm || 10000,
        now
      );

      const apiKey = await this.findById(id);
      if (!apiKey) {
        throw new Error('Failed to create API key');
      }

      logger.info('API key created', { 
        apiKeyId: id, 
        userId: keyData.userId, 
        name: keyData.name 
      });
      
      return apiKey;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('API key hash collision (very rare)');
      }
      if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new Error('User not found');
      }
      logger.error('Failed to create API key', { error, userId: keyData.userId });
      throw error;
    }
  }

  /**
   * Find API key by ID
   */
  async findById(id: string): Promise<ApiKey | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM api_keys WHERE id = ?');
      const row = stmt.get(id) as any;

      return row ? this.mapRowToApiKey(row) : null;
    } catch (error) {
      logger.error('Failed to find API key by ID', { error, apiKeyId: id });
      throw error;
    }
  }

  /**
   * Find API key by hash
   */
  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM api_keys 
        WHERE key_hash = ? AND is_active = 1
      `);
      const row = stmt.get(keyHash) as any;

      return row ? this.mapRowToApiKey(row) : null;
    } catch (error) {
      logger.error('Failed to find API key by hash', { error });
      throw error;
    }
  }

  /**
   * Find API keys by user ID
   */
  async findByUserId(userId: string): Promise<ApiKey[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM api_keys 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `);
      const rows = stmt.all(userId) as any[];

      return rows.map(row => this.mapRowToApiKey(row));
    } catch (error) {
      logger.error('Failed to find API keys by user ID', { error, userId });
      throw error;
    }
  }

  /**
   * Update API key
   */
  async update(id: string, updates: Partial<ApiKey>): Promise<ApiKey | null> {
    try {
      const allowedFields = ['name', 'permissions', 'rateLimitRpm', 'rateLimitTpm', 'isActive'];
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          let dbField = key;
          let dbValue = value;

          // Map field names to database columns
          if (key === 'rateLimitRpm') {
            dbField = 'rate_limit_rpm';
          } else if (key === 'rateLimitTpm') {
            dbField = 'rate_limit_tpm';
          } else if (key === 'isActive') {
            dbField = 'is_active';
            dbValue = value ? 1 : 0;
          } else if (key === 'permissions') {
            dbValue = JSON.stringify(value);
          }

          updateFields.push(`${dbField} = ?`);
          updateValues.push(dbValue);
        }
      }

      if (updateFields.length === 0) {
        return this.findById(id);
      }

      updateValues.push(id);

      const stmt = this.db.prepare(`
        UPDATE api_keys 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `);

      const result = stmt.run(...updateValues);

      if (result.changes === 0) {
        return null;
      }

      logger.info('API key updated', { apiKeyId: id, fields: updateFields });
      return this.findById(id);
    } catch (error) {
      logger.error('Failed to update API key', { error, apiKeyId: id });
      throw error;
    }
  }

  /**
   * Delete API key
   */
  async delete(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM api_keys WHERE id = ?');
      const result = stmt.run(id);

      const deleted = result.changes > 0;
      if (deleted) {
        logger.info('API key deleted', { apiKeyId: id });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete API key', { error, apiKeyId: id });
      throw error;
    }
  }

  /**
   * Deactivate API key
   */
  async deactivate(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        UPDATE api_keys 
        SET is_active = 0 
        WHERE id = ?
      `);
      const result = stmt.run(id);

      const deactivated = result.changes > 0;
      if (deactivated) {
        logger.info('API key deactivated', { apiKeyId: id });
      }

      return deactivated;
    } catch (error) {
      logger.error('Failed to deactivate API key', { error, apiKeyId: id });
      throw error;
    }
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(keyId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE api_keys 
        SET last_used_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `);
      stmt.run(keyId);
    } catch (error) {
      // Don't throw error for last used update failure
      logger.warn('Failed to update API key last used timestamp', { 
        error, 
        apiKeyId: keyId 
      });
    }
  }

  /**
   * Get API key usage statistics
   */
  async getUsageStats(keyId: string, days: number = 30): Promise<any> {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(ul.id) as total_requests,
          COALESCE(SUM(ul.total_tokens), 0) as total_tokens,
          COALESCE(SUM(ul.cost), 0) as total_cost,
          COALESCE(AVG(ul.latency), 0) as avg_latency,
          COUNT(CASE WHEN ul.success = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(ul.id), 0) as success_rate,
          MIN(ul.created_at) as first_request,
          MAX(ul.created_at) as last_request
        FROM api_keys ak
        LEFT JOIN usage_logs ul ON ak.id = ul.api_key_id 
          AND ul.created_at >= datetime('now', '-' || ? || ' days')
        WHERE ak.id = ?
        GROUP BY ak.id
      `);

      const stats = stmt.get(days, keyId) as any;

      return {
        totalRequests: stats?.total_requests || 0,
        totalTokens: stats?.total_tokens || 0,
        totalCost: stats?.total_cost || 0,
        averageLatency: stats?.avg_latency || 0,
        successRate: stats?.success_rate || 100,
        firstRequest: stats?.first_request ? new Date(stats.first_request) : null,
        lastRequest: stats?.last_request ? new Date(stats.last_request) : null,
      };
    } catch (error) {
      logger.error('Failed to get API key usage stats', { error, apiKeyId: keyId });
      throw error;
    }
  }

  /**
   * List API keys with pagination
   */
  async list(options: {
    userId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    includeInactive?: boolean;
  } = {}): Promise<{ apiKeys: ApiKey[]; total: number }> {
    const {
      userId,
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      includeInactive = false,
    } = options;

    try {
      const offset = (page - 1) * limit;
      const allowedSortFields = ['created_at', 'last_used_at', 'name'];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
      const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

      let whereClause = '';
      let params: any[] = [];

      if (userId) {
        whereClause = 'WHERE user_id = ?';
        params.push(userId);
      }

      if (!includeInactive) {
        whereClause += whereClause ? ' AND is_active = 1' : 'WHERE is_active = 1';
      }

      // Get total count
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as total FROM api_keys ${whereClause}
      `);
      const { total } = countStmt.get(...params) as { total: number };

      // Get API keys
      const stmt = this.db.prepare(`
        SELECT * FROM api_keys 
        ${whereClause}
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(...params, limit, offset) as any[];
      const apiKeys = rows.map(row => this.mapRowToApiKey(row));

      return { apiKeys, total };
    } catch (error) {
      logger.error('Failed to list API keys', { error, options });
      throw error;
    }
  }

  /**
   * Check if API key exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM api_keys WHERE id = ?');
      const result = stmt.get(id);
      return Boolean(result);
    } catch (error) {
      logger.error('Failed to check if API key exists', { error, apiKeyId: id });
      throw error;
    }
  }

  /**
   * Map database row to ApiKey object
   */
  private mapRowToApiKey(row: any): ApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      keyHash: row.key_hash,
      name: row.name,
      permissions: JSON.parse(row.permissions || '[]'),
      rateLimitRpm: row.rate_limit_rpm,
      rateLimitTpm: row.rate_limit_tpm,
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    };
  }
}
