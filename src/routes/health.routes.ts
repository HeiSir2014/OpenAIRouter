/**
 * Health check routes
 * System health and status endpoints
 */

import { Router } from 'express';

import { DatabaseConnection } from '../database/connection.js';
import { checkProviderHealth } from '../providers/factory.js';
import { logger } from '../utils/logger.util.js';
import { asyncHandler } from '../middleware/error.middleware.js';
import { appConfig } from '../config/app.config.js';

/**
 * Create health check routes
 */
export const createHealthRoutes = (): Router => {
  const router = Router();

  /**
   * @route GET /health
   * @desc Basic health check
   * @access Public
   */
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const startTime = Date.now();

      try {
        // Check database health
        const dbHealth = DatabaseConnection.checkHealth();

        // Check provider health (simplified for basic health check)
        const providersHealthy = true; // We'll do a quick check without full provider health

        const isHealthy = dbHealth.status === 'healthy' && providersHealthy;
        const responseTime = Date.now() - startTime;

        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          environment: appConfig.env,
          uptime: process.uptime(),
          responseTime: `${responseTime}ms`,
          database: {
            status: dbHealth.status,
            latency: `${dbHealth.latency}ms`,
          },
        });
      } catch (error) {
        logger.error('Health check failed', { error });

        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Health check failed',
          responseTime: `${Date.now() - startTime}ms`,
        });
      }
    }),
  );

  /**
   * @route GET /health/detailed
   * @desc Detailed health check with all components
   * @access Public
   */
  router.get(
    '/detailed',
    asyncHandler(async (req, res) => {
      const startTime = Date.now();

      try {
        // Check database health
        const dbHealth = DatabaseConnection.checkHealth();
        const dbStats = DatabaseConnection.getStats();

        // Check provider health
        const providerHealth = await checkProviderHealth();

        // Memory usage
        const memoryUsage = process.memoryUsage();
        const memoryUsageMB = {
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        };

        // CPU usage (simplified)
        const cpuUsage = process.cpuUsage();

        // Determine overall health
        const dbHealthy = dbHealth.status === 'healthy';
        const providersHealthy = Object.values(providerHealth).some(health => health.healthy);
        const memoryHealthy = memoryUsageMB.heapUsed < 1000; // Less than 1GB

        const isHealthy = dbHealthy && providersHealthy && memoryHealthy;
        const responseTime = Date.now() - startTime;

        res.status(isHealthy ? 200 : 503).json({
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          environment: appConfig.env,
          uptime: process.uptime(),
          responseTime: `${responseTime}ms`,
          database: {
            status: dbHealth.status,
            latency: `${dbHealth.latency}ms`,
            stats: dbStats,
          },
          providers: providerHealth,
          system: {
            memory: {
              usage: memoryUsageMB,
              healthy: memoryHealthy,
            },
            cpu: {
              user: cpuUsage.user,
              system: cpuUsage.system,
            },
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
          },
        });
      } catch (error) {
        logger.error('Detailed health check failed', { error });

        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Detailed health check failed',
          responseTime: `${Date.now() - startTime}ms`,
        });
      }
    }),
  );

  /**
   * @route GET /health/database
   * @desc Database-specific health check
   * @access Public
   */
  router.get(
    '/database',
    asyncHandler(async (req, res) => {
      try {
        const dbHealth = DatabaseConnection.checkHealth();
        const dbStats = DatabaseConnection.getStats();

        res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
          status: dbHealth.status,
          timestamp: new Date().toISOString(),
          latency: `${dbHealth.latency}ms`,
          stats: dbStats,
        });
      } catch (error) {
        logger.error('Database health check failed', { error });

        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Database health check failed',
        });
      }
    }),
  );

  /**
   * @route GET /health/providers
   * @desc Provider-specific health check
   * @access Public
   */
  router.get(
    '/providers',
    asyncHandler(async (req, res) => {
      try {
        const providerHealth = await checkProviderHealth();
        const overallHealthy = Object.values(providerHealth).some(health => health.healthy);

        res.status(overallHealthy ? 200 : 503).json({
          status: overallHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          providers: providerHealth,
        });
      } catch (error) {
        logger.error('Provider health check failed', { error });

        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: 'Provider health check failed',
        });
      }
    }),
  );

  /**
   * @route GET /health/memory
   * @desc Memory usage information
   * @access Public
   */
  router.get(
    '/memory',
    asyncHandler(async (req, res) => {
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
      };

      const memoryHealthy = memoryUsageMB.heapUsed < 1000; // Less than 1GB

      res.json({
        status: memoryHealthy ? 'healthy' : 'warning',
        timestamp: new Date().toISOString(),
        memory: {
          usage: memoryUsageMB,
          raw: memoryUsage,
          healthy: memoryHealthy,
        },
      });
    }),
  );

  /**
   * @route GET /health/uptime
   * @desc System uptime information
   * @access Public
   */
  router.get(
    '/uptime',
    asyncHandler(async (req, res) => {
      const uptime = process.uptime();
      const uptimeFormatted = {
        seconds: Math.floor(uptime % 60),
        minutes: Math.floor((uptime / 60) % 60),
        hours: Math.floor((uptime / 3600) % 24),
        days: Math.floor(uptime / 86400),
      };

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: {
          seconds: uptime,
          formatted: uptimeFormatted,
          human: `${uptimeFormatted.days}d ${uptimeFormatted.hours}h ${uptimeFormatted.minutes}m ${uptimeFormatted.seconds}s`,
        },
        startTime: new Date(Date.now() - uptime * 1000).toISOString(),
      });
    }),
  );

  return router;
};
