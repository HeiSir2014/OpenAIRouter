/**
 * SQLite database connection and initialization
 * Manages database connection, schema creation, and migrations
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

import { getDatabaseConfig } from '../config/app.config.js';
import { logger } from '../utils/logger.util.js';

/**
 * Database connection singleton
 */
export class DatabaseConnection {
  private static instance: Database.Database;
  private static isInitialized = false;

  /**
   * Get database instance
   */
  public static getInstance(): Database.Database {
    if (!DatabaseConnection.instance) {
      const config = getDatabaseConfig();
      
      // Ensure database directory exists
      const dbDir = path.dirname(config.path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info('Created database directory', { path: dbDir });
      }

      // Create database connection
      DatabaseConnection.instance = new Database(config.path, config.options);
      
      // Configure SQLite for better performance and reliability
      DatabaseConnection.instance.pragma('journal_mode = WAL');
      DatabaseConnection.instance.pragma('foreign_keys = ON');
      DatabaseConnection.instance.pragma('synchronous = NORMAL');
      DatabaseConnection.instance.pragma('cache_size = 1000');
      DatabaseConnection.instance.pragma('temp_store = memory');

      logger.info('Database connection established', { path: config.path });
    }

    return DatabaseConnection.instance;
  }

  /**
   * Initialize database schema
   */
  public static async initialize(): Promise<void> {
    if (DatabaseConnection.isInitialized) {
      return;
    }

    const db = DatabaseConnection.getInstance();
    
    try {
      // Begin transaction for schema creation
      db.transaction(() => {
        // Create users table
        db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
            credits REAL DEFAULT 0 CHECK (credits >= 0),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Create API keys table
        db.exec(`
          CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            key_hash TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            permissions TEXT DEFAULT '[]',
            rate_limit_rpm INTEGER DEFAULT 60 CHECK (rate_limit_rpm > 0),
            rate_limit_tpm INTEGER DEFAULT 10000 CHECK (rate_limit_tpm > 0),
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `);

        // Create usage logs table
        db.exec(`
          CREATE TABLE IF NOT EXISTS usage_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            api_key_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_tokens INTEGER DEFAULT 0 CHECK (prompt_tokens >= 0),
            completion_tokens INTEGER DEFAULT 0 CHECK (completion_tokens >= 0),
            total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
            cost REAL DEFAULT 0 CHECK (cost >= 0),
            latency INTEGER DEFAULT 0 CHECK (latency >= 0),
            success BOOLEAN DEFAULT 1,
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
          );
        `);

        // Create indexes for better performance
        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
          CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
          CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_id ON usage_logs(api_key_id);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_provider ON usage_logs(provider);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_model ON usage_logs(model);
        `);

        // Create triggers for updated_at timestamp
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS update_users_updated_at
          AFTER UPDATE ON users
          BEGIN
            UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
          END;
        `);

        // Create view for user statistics
        db.exec(`
          CREATE VIEW IF NOT EXISTS user_stats AS
          SELECT 
            u.id,
            u.email,
            u.name,
            u.plan,
            u.credits,
            COUNT(ul.id) as total_requests,
            COALESCE(SUM(ul.total_tokens), 0) as total_tokens,
            COALESCE(SUM(ul.cost), 0) as total_cost,
            COALESCE(AVG(ul.latency), 0) as avg_latency,
            COUNT(CASE WHEN ul.success = 1 THEN 1 END) * 100.0 / COUNT(ul.id) as success_rate
          FROM users u
          LEFT JOIN usage_logs ul ON u.id = ul.user_id
          GROUP BY u.id, u.email, u.name, u.plan, u.credits;
        `);

        logger.info('Database schema initialized successfully');
      })();

      DatabaseConnection.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize database schema', { error });
      throw error;
    }
  }

  /**
   * Close database connection
   */
  public static close(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
      DatabaseConnection.instance = null as any;
      DatabaseConnection.isInitialized = false;
      logger.info('Database connection closed');
    }
  }

  /**
   * Check database health
   */
  public static checkHealth(): { status: string; latency: number } {
    const start = Date.now();
    
    try {
      const db = DatabaseConnection.getInstance();
      const result = db.prepare('SELECT 1 as health').get();
      const latency = Date.now() - start;
      
      return {
        status: result ? 'healthy' : 'unhealthy',
        latency,
      };
    } catch (error) {
      logger.error('Database health check failed', { error });
      return {
        status: 'unhealthy',
        latency: Date.now() - start,
      };
    }
  }

  /**
   * Get database statistics
   */
  public static getStats(): Record<string, unknown> {
    try {
      const db = DatabaseConnection.getInstance();
      
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
      const apiKeyCount = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get() as { count: number };
      const usageCount = db.prepare('SELECT COUNT(*) as count FROM usage_logs').get() as { count: number };
      
      const dbSize = fs.statSync(getDatabaseConfig().path).size;
      
      return {
        users: userCount.count,
        activeApiKeys: apiKeyCount.count,
        usageLogs: usageCount.count,
        databaseSize: dbSize,
        isWalMode: db.pragma('journal_mode', { simple: true }) === 'wal',
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      return {};
    }
  }

  /**
   * Run database maintenance tasks
   */
  public static maintenance(): void {
    try {
      const db = DatabaseConnection.getInstance();
      
      // Analyze tables for query optimization
      db.exec('ANALYZE');
      
      // Vacuum database if needed (only in non-WAL mode)
      const journalMode = db.pragma('journal_mode', { simple: true });
      if (journalMode !== 'wal') {
        db.exec('VACUUM');
      }
      
      // Clean up old usage logs (older than 90 days)
      const cleanupResult = db.prepare(`
        DELETE FROM usage_logs 
        WHERE created_at < datetime('now', '-90 days')
      `).run();
      
      logger.info('Database maintenance completed', {
        journalMode,
        cleanedUpLogs: cleanupResult.changes,
      });
    } catch (error) {
      logger.error('Database maintenance failed', { error });
    }
  }
}
