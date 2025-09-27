/**
 * Authentication and authorization type definitions
 */

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  plan: UserPlan;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
}

export type UserPlan = 'free' | 'pro' | 'enterprise';

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  plan?: UserPlan;
  credits?: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  name: string;
  permissions: string[];
  rateLimitRpm: number;
  rateLimitTpm: number;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface CreateApiKeyData {
  userId: string;
  keyHash: string;
  name: string;
  permissions?: string[];
  rateLimitRpm?: number;
  rateLimitTpm?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: Omit<User, 'passwordHash'>;
  token: string;
  expiresIn: string;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions?: string[];
  rateLimitRpm?: number;
  rateLimitTpm?: number;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string; // Only returned on creation
  permissions: string[];
  rateLimitRpm: number;
  rateLimitTpm: number;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  plan: UserPlan;
  credits: number;
  usage: {
    totalRequests: number;
    totalTokens: number;
    monthlyRequests: number;
    monthlyTokens: number;
  };
  createdAt: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  plan: UserPlan;
  iat: number;
  exp: number;
}

// Express request extension
declare global {
  namespace Express {
    interface Request {
      user?: User;
      apiKey?: ApiKey;
    }
  }
}
