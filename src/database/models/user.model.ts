/**
 * User model
 * Database operations for user management
 */

import { DatabaseConnection } from '../connection.js';
import { User, CreateUserData, UserPlan } from '../../types/auth.types.js';
import { generateUuid } from '../../utils/crypto.util.js';
import { logger } from '../../utils/logger.util.js';

/**
 * User model class
 */
export class UserModel {
  private db = DatabaseConnection.getInstance();

  /**
   * Create a new user
   */
  async create(userData: CreateUserData): Promise<User> {
    const id = generateUuid();
    const now = new Date().toISOString();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (id, email, name, password_hash, plan, credits, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        userData.email.toLowerCase(),
        userData.name,
        userData.passwordHash,
        userData.plan || 'free',
        userData.credits || 0,
        now,
        now
      );

      const user = await this.findById(id);
      if (!user) {
        throw new Error('Failed to create user');
      }

      logger.info('User created', { userId: id, email: userData.email });
      return user;
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Email already exists');
      }
      logger.error('Failed to create user', { error, email: userData.email });
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
      const row = stmt.get(id) as any;

      return row ? this.mapRowToUser(row) : null;
    } catch (error) {
      logger.error('Failed to find user by ID', { error, userId: id });
      throw error;
    }
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
      const row = stmt.get(email.toLowerCase()) as any;

      return row ? this.mapRowToUser(row) : null;
    } catch (error) {
      logger.error('Failed to find user by email', { error, email });
      throw error;
    }
  }

  /**
   * Update user
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    try {
      const allowedFields = ['name', 'plan', 'credits'];
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updateFields.push(`${key} = ?`);
          updateValues.push(value);
        }
      }

      if (updateFields.length === 0) {
        return this.findById(id);
      }

      updateValues.push(id);

      const stmt = this.db.prepare(`
        UPDATE users 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const result = stmt.run(...updateValues);

      if (result.changes === 0) {
        return null;
      }

      logger.info('User updated', { userId: id, fields: updateFields });
      return this.findById(id);
    } catch (error) {
      logger.error('Failed to update user', { error, userId: id });
      throw error;
    }
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
      const result = stmt.run(id);

      const deleted = result.changes > 0;
      if (deleted) {
        logger.info('User deleted', { userId: id });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete user', { error, userId: id });
      throw error;
    }
  }

  /**
   * Update user credits
   */
  async updateCredits(userId: string, amount: number): Promise<User | null> {
    try {
      const stmt = this.db.prepare(`
        UPDATE users 
        SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND credits + ? >= 0
      `);

      const result = stmt.run(amount, userId, amount);

      if (result.changes === 0) {
        throw new Error('Insufficient credits or user not found');
      }

      logger.info('User credits updated', { userId, amount });
      return this.findById(userId);
    } catch (error) {
      logger.error('Failed to update user credits', { error, userId, amount });
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getStats(userId: string): Promise<any> {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(ul.id) as total_requests,
          COALESCE(SUM(ul.total_tokens), 0) as total_tokens,
          COALESCE(SUM(ul.cost), 0) as total_cost,
          COALESCE(AVG(ul.latency), 0) as avg_latency,
          COUNT(CASE WHEN ul.success = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(ul.id), 0) as success_rate,
          COUNT(CASE WHEN ul.created_at >= datetime('now', 'start of month') THEN 1 END) as monthly_requests,
          COALESCE(SUM(CASE WHEN ul.created_at >= datetime('now', 'start of month') THEN ul.total_tokens ELSE 0 END), 0) as monthly_tokens
        FROM users u
        LEFT JOIN usage_logs ul ON u.id = ul.user_id
        WHERE u.id = ?
        GROUP BY u.id
      `);

      const stats = stmt.get(userId) as any;

      return {
        totalRequests: stats?.total_requests || 0,
        totalTokens: stats?.total_tokens || 0,
        totalCost: stats?.total_cost || 0,
        averageLatency: stats?.avg_latency || 0,
        successRate: stats?.success_rate || 100,
        monthlyRequests: stats?.monthly_requests || 0,
        monthlyTokens: stats?.monthly_tokens || 0,
      };
    } catch (error) {
      logger.error('Failed to get user stats', { error, userId });
      throw error;
    }
  }

  /**
   * List users with pagination
   */
  async list(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    search?: string;
  } = {}): Promise<{ users: User[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
      search,
    } = options;

    try {
      const offset = (page - 1) * limit;
      const allowedSortFields = ['created_at', 'updated_at', 'email', 'name', 'plan'];
      const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
      const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

      let whereClause = '';
      let searchParams: any[] = [];

      if (search) {
        whereClause = 'WHERE (email LIKE ? OR name LIKE ?)';
        const searchPattern = `%${search}%`;
        searchParams = [searchPattern, searchPattern];
      }

      // Get total count
      const countStmt = this.db.prepare(`
        SELECT COUNT(*) as total FROM users ${whereClause}
      `);
      const { total } = countStmt.get(...searchParams) as { total: number };

      // Get users
      const stmt = this.db.prepare(`
        SELECT * FROM users 
        ${whereClause}
        ORDER BY ${sortField} ${order}
        LIMIT ? OFFSET ?
      `);

      const rows = stmt.all(...searchParams, limit, offset) as any[];
      const users = rows.map(row => this.mapRowToUser(row));

      return { users, total };
    } catch (error) {
      logger.error('Failed to list users', { error, options });
      throw error;
    }
  }

  /**
   * Check if user exists
   */
  async exists(id: string): Promise<boolean> {
    try {
      const stmt = this.db.prepare('SELECT 1 FROM users WHERE id = ?');
      const result = stmt.get(id);
      return Boolean(result);
    } catch (error) {
      logger.error('Failed to check if user exists', { error, userId: id });
      throw error;
    }
  }

  /**
   * Map database row to User object
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      plan: row.plan as UserPlan,
      credits: row.credits,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
