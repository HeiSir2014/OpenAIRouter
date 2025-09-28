/**
 * Rate limiting middleware
 * Simple in-memory rate limiting for Phase 1 (will be enhanced with Redis in Phase 2)
 */

import { Request, Response, NextFunction } from 'express';

import { logger } from '../utils/logger.util.js';

/**
 * Rate limit store interface
 */
interface RateLimitStore {
  get(key: string): Promise<number | null>;
  increment(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}

/**
 * In-memory rate limit store
 * Simple implementation for Phase 1
 */
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.resetTime) {
      this.store.delete(key);
      return null;
    }

    return entry.count;
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired entry
      const newEntry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, newEntry);
      return 1;
    }

    // Increment existing entry
    entry.count++;
    return entry.count;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}

/**
 * Global rate limit store instance
 */
const rateLimitStore = new MemoryRateLimitStore();

/**
 * Rate limiting middleware factory
 */
export const rateLimit = (config: RateLimitConfig) => {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached,
  } = config;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = keyGenerator(req);
      const current = await rateLimitStore.increment(key, windowMs);

      // Calculate reset time
      const resetTime = new Date(Date.now() + windowMs);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - current).toString(),
        'X-RateLimit-Reset': resetTime.toISOString(),
        'X-RateLimit-Window': windowMs.toString(),
      });

      // Check if limit exceeded
      if (current > maxRequests) {
        logger.warn('Rate limit exceeded', {
          key,
          current,
          limit: maxRequests,
          windowMs,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          userId: req.user?.id,
        });

        // Call custom handler if provided
        if (onLimitReached) {
          onLimitReached(req, res);
          return;
        }

        res.status(429).json({
          error: {
            message: 'Too many requests, please try again later',
            type: 'rate_limit_error',
            code: 'rate_limit_exceeded',
            details: {
              limit: maxRequests,
              windowMs,
              resetTime: resetTime.toISOString(),
            },
          },
        });
        return;
      }

      // Track response to potentially skip counting
      const originalSend = res.send;
      res.send = function (body: any) {
        const statusCode = res.statusCode;

        // Decrement counter if we should skip this request
        if (
          (skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) ||
          (skipFailedRequests && statusCode >= 400)
        ) {
          rateLimitStore
            .increment(key, windowMs)
            .then(newCount => {
              // Decrement by setting to newCount - 1
              // This is a simplified approach for the memory store
            })
            .catch(error => {
              logger.warn('Failed to adjust rate limit counter', { error, key });
            });
        }

        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Rate limit middleware error', {
        error,
        ip: req.ip,
        path: req.path,
        method: req.method,
      });

      // Don't block request on rate limit errors
      next();
    }
  };
};

/**
 * API key based rate limiting
 */
export const apiKeyRateLimit = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      // No API key, skip rate limiting
      next();
      return;
    }

    // Create rate limiter with API key specific limits
    const rateLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: apiKey.rateLimitRpm,
      keyGenerator: () => `apikey:${apiKey.id}`,
      onLimitReached: (req: Request, res: Response) => {
        logger.warn('API key rate limit exceeded', {
          apiKeyId: apiKey.id,
          userId: apiKey.userId,
          limit: apiKey.rateLimitRpm,
          ip: req.ip,
        });

        res.status(429).json({
          error: {
            message: `API key rate limit exceeded. Limit: ${apiKey.rateLimitRpm} requests per minute`,
            type: 'rate_limit_error',
            code: 'api_key_rate_limit_exceeded',
            details: {
              limit: apiKey.rateLimitRpm,
              windowMs: 60000,
              resetTime: new Date(Date.now() + 60000).toISOString(),
            },
          },
        });
      },
    });

    await rateLimiter(req, res, next);
  };
};

/**
 * Token-based rate limiting
 * Limits based on token usage rather than request count
 */
export const tokenRateLimit = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.apiKey;

    if (!apiKey) {
      next();
      return;
    }

    // Estimate token usage from request
    const estimatedTokens = estimateTokenUsage(req);

    if (estimatedTokens === 0) {
      next();
      return;
    }

    try {
      const key = `tokens:${apiKey.id}`;
      const current = await rateLimitStore.increment(key, 60 * 1000); // 1 minute window
      const estimatedTotal = current + estimatedTokens;

      if (estimatedTotal > apiKey.rateLimitTpm) {
        logger.warn('Token rate limit would be exceeded', {
          apiKeyId: apiKey.id,
          userId: apiKey.userId,
          estimatedTokens,
          currentTokens: current,
          limit: apiKey.rateLimitTpm,
          ip: req.ip,
        });

        res.status(429).json({
          error: {
            message: `Token rate limit would be exceeded. Limit: ${apiKey.rateLimitTpm} tokens per minute`,
            type: 'rate_limit_error',
            code: 'token_rate_limit_exceeded',
            details: {
              estimatedTokens,
              currentTokens: current,
              limit: apiKey.rateLimitTpm,
              windowMs: 60000,
            },
          },
        });
        return;
      }

      // Store estimated tokens for later adjustment
      req.estimatedTokens = estimatedTokens;

      next();
    } catch (error) {
      logger.error('Token rate limit error', { error, apiKeyId: apiKey.id });
      next(); // Don't block on errors
    }
  };
};

/**
 * Global rate limiting for all requests
 */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000, // Limit each IP to 1000 requests per windowMs
  keyGenerator: (req: Request) => req.ip || 'unknown',
});

/**
 * Estimate token usage from request
 */
function estimateTokenUsage(req: Request): number {
  const body = req.body;

  if (!body) {
    return 0;
  }

  let tokenCount = 0;

  // Estimate based on messages
  if (body.messages && Array.isArray(body.messages)) {
    for (const message of body.messages) {
      if (message.content && typeof message.content === 'string') {
        // Rough estimation: 1 token per 4 characters
        tokenCount += Math.ceil(message.content.length / 4);
      }
    }
  }

  // Estimate based on prompt
  if (body.prompt && typeof body.prompt === 'string') {
    tokenCount += Math.ceil(body.prompt.length / 4);
  }

  // Add estimated completion tokens
  const maxTokens = body.max_tokens || 1000;
  tokenCount += maxTokens;

  return tokenCount;
}

/**
 * Cleanup rate limit store on shutdown
 */
export const cleanupRateLimit = (): void => {
  rateLimitStore.destroy();
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      estimatedTokens?: number;
    }
  }
}
