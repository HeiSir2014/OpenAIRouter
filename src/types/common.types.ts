/**
 * Common type definitions used across the application
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
  timestamp: Date;
}

export interface ApiError {
  code: string;
  message: string;
  type: ErrorType;
  details?: Record<string, unknown>;
  stack?: string;
}

export type ErrorType =
  | 'validation_error'
  | 'authentication_error'
  | 'authorization_error'
  | 'not_found_error'
  | 'rate_limit_error'
  | 'provider_error'
  | 'internal_error'
  | 'external_api_error';

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface UsageLog {
  id: string;
  userId: string;
  apiKeyId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latency?: number;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

export interface CreateUsageLogData {
  userId: string;
  apiKeyId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  latency?: number;
  success?: boolean;
  errorMessage?: string;
}

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  successRate: number;
  topModels: Array<{
    model: string;
    requests: number;
    tokens: number;
  }>;
  topProviders: Array<{
    provider: string;
    requests: number;
    tokens: number;
  }>;
  dailyUsage: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  windowStart: Date;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  version: string;
  uptime: number;
  database: {
    status: 'connected' | 'disconnected';
    latency: number;
  };
  providers: Array<{
    name: string;
    status: 'healthy' | 'unhealthy';
    latency: number;
  }>;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
}

export interface LogLevel {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  userId?: string;
  requestId?: string;
}

export interface ConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Utility types
export type Nullable<T> = T | null;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Environment types
export type Environment = 'development' | 'production' | 'test';

export interface AppConfig {
  env: Environment;
  port: number;
  dbPath: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  logLevel: string;
  logFile?: string;
  corsOrigins: string[];
  rateLimits: {
    defaultRpm: number;
    defaultTpm: number;
    windowMs: number;
  };
  disableAuth: boolean;
}
