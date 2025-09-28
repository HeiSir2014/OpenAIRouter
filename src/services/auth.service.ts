/**
 * Authentication service
 * Handles user authentication, registration, and API key management
 */

import { UserModel } from '../database/models/user.model.js';
import { ApiKeyModel } from '../database/models/api-key.model.js';
import {
  User,
  CreateUserData,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  CreateApiKeyRequest,
  ApiKeyResponse,
  UserProfile,
} from '../types/auth.types.js';
import {
  hashPassword,
  verifyPassword,
  generateJwtToken,
  generateApiKey,
  hashApiKey,
} from '../utils/crypto.util.js';
import { logger, logAuthEvent } from '../utils/logger.util.js';
import {
  createAuthError,
  createValidationError,
  createNotFoundError,
} from '../middleware/error.middleware.js';

/**
 * Authentication service class
 */
export class AuthService {
  private userModel = new UserModel();
  private apiKeyModel = new ApiKeyModel();

  /**
   * Register a new user
   */
  async register(registerData: RegisterRequest, ip?: string): Promise<AuthResponse> {
    try {
      // Check if user already exists
      const existingUser = await this.userModel.findByEmail(registerData.email);
      if (existingUser) {
        logAuthEvent({
          event: 'register',
          email: registerData.email,
          ip,
          success: false,
          error: 'Email already exists',
        });

        throw createValidationError('Email already exists', {
          field: 'email',
          value: registerData.email,
        });
      }

      // Hash password
      const passwordHash = await hashPassword(registerData.password);

      // Create user data
      const userData: CreateUserData = {
        email: registerData.email.toLowerCase(),
        name: registerData.name,
        passwordHash,
        plan: 'free',
        credits: 100, // Give new users 100 free credits
      };

      // Create user
      const user = await this.userModel.create(userData);

      // Generate JWT token
      const token = generateJwtToken(user);

      logAuthEvent({
        event: 'register',
        userId: user.id,
        email: user.email,
        ip,
        success: true,
      });

      logger.info('User registered successfully', {
        userId: user.id,
        email: user.email,
        plan: user.plan,
      });

      return {
        user: this.sanitizeUser(user),
        token,
        expiresIn: '7d',
      };
    } catch (error) {
      logger.error('User registration failed', {
        error,
        email: registerData.email,
        ip,
      });
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(loginData: LoginRequest, ip?: string): Promise<AuthResponse> {
    try {
      // Find user by email
      const user = await this.userModel.findByEmail(loginData.email);
      if (!user) {
        logAuthEvent({
          event: 'login',
          email: loginData.email,
          ip,
          success: false,
          error: 'User not found',
        });

        throw createAuthError('Invalid email or password');
      }

      // Verify password
      const isValidPassword = await verifyPassword(loginData.password, user.passwordHash);
      if (!isValidPassword) {
        logAuthEvent({
          event: 'login',
          userId: user.id,
          email: user.email,
          ip,
          success: false,
          error: 'Invalid password',
        });

        throw createAuthError('Invalid email or password');
      }

      // Generate JWT token
      const token = generateJwtToken(user);

      logAuthEvent({
        event: 'login',
        userId: user.id,
        email: user.email,
        ip,
        success: true,
      });

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
      });

      return {
        user: this.sanitizeUser(user),
        token,
        expiresIn: '7d',
      };
    } catch (error) {
      logger.error('User login failed', {
        error,
        email: loginData.email,
        ip,
      });
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<UserProfile> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw createNotFoundError('User');
      }

      // Get user statistics
      const stats = await this.userModel.getStats(userId);

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        credits: user.credits,
        usage: stats,
        createdAt: user.createdAt,
      };
    } catch (error) {
      logger.error('Failed to get user profile', { error, userId });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: { name?: string; email?: string },
  ): Promise<UserProfile> {
    try {
      // Check if email is being updated and already exists
      if (updates.email) {
        const existingUser = await this.userModel.findByEmail(updates.email);
        if (existingUser && existingUser.id !== userId) {
          throw createValidationError('Email already exists', {
            field: 'email',
            value: updates.email,
          });
        }
      }

      const updatedUser = await this.userModel.update(userId, updates);
      if (!updatedUser) {
        throw createNotFoundError('User');
      }

      logger.info('User profile updated', {
        userId,
        updates: Object.keys(updates),
      });

      return this.getProfile(userId);
    } catch (error) {
      logger.error('Failed to update user profile', { error, userId, updates });
      throw error;
    }
  }

  /**
   * Create API key
   */
  async createApiKey(
    userId: string,
    keyData: CreateApiKeyRequest,
    ip?: string,
  ): Promise<ApiKeyResponse> {
    try {
      // Verify user exists
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw createNotFoundError('User');
      }

      // Check if user already has maximum number of API keys
      const existingKeys = await this.apiKeyModel.findByUserId(userId);
      const maxKeys = this.getMaxApiKeysForPlan(user.plan);

      if (existingKeys.length >= maxKeys) {
        throw createValidationError(`Maximum number of API keys reached for ${user.plan} plan`, {
          currentCount: existingKeys.length,
          maxAllowed: maxKeys,
          plan: user.plan,
        });
      }

      // Generate API key
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);

      // Create API key data
      const createData = {
        userId,
        keyHash,
        name: keyData.name,
        permissions: keyData.permissions || [],
        rateLimitRpm: keyData.rateLimitRpm || this.getDefaultRateLimitRpm(user.plan),
        rateLimitTpm: keyData.rateLimitTpm || this.getDefaultRateLimitTpm(user.plan),
      };

      // Save to database
      const savedKey = await this.apiKeyModel.create(createData);

      logAuthEvent({
        event: 'api_key_created',
        userId,
        email: user.email,
        ip,
        success: true,
      });

      logger.info('API key created', {
        apiKeyId: savedKey.id,
        userId,
        name: keyData.name,
      });

      return {
        id: savedKey.id,
        name: savedKey.name,
        key: apiKey, // Only returned on creation
        permissions: savedKey.permissions,
        rateLimitRpm: savedKey.rateLimitRpm,
        rateLimitTpm: savedKey.rateLimitTpm,
        isActive: savedKey.isActive,
        createdAt: savedKey.createdAt,
        lastUsedAt: savedKey.lastUsedAt,
      };
    } catch (error) {
      logger.error('Failed to create API key', { error, userId, keyData });
      throw error;
    }
  }

  /**
   * List user's API keys
   */
  async listApiKeys(userId: string): Promise<Omit<ApiKeyResponse, 'key'>[]> {
    try {
      const apiKeys = await this.apiKeyModel.findByUserId(userId);

      return apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        permissions: key.permissions,
        rateLimitRpm: key.rateLimitRpm,
        rateLimitTpm: key.rateLimitTpm,
        isActive: key.isActive,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
      }));
    } catch (error) {
      logger.error('Failed to list API keys', { error, userId });
      throw error;
    }
  }

  /**
   * Get API key details
   */
  async getApiKey(userId: string, keyId: string): Promise<Omit<ApiKeyResponse, 'key'>> {
    try {
      const apiKey = await this.apiKeyModel.findById(keyId);

      if (!apiKey || apiKey.userId !== userId) {
        throw createNotFoundError('API key');
      }

      return {
        id: apiKey.id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        rateLimitRpm: apiKey.rateLimitRpm,
        rateLimitTpm: apiKey.rateLimitTpm,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
      };
    } catch (error) {
      logger.error('Failed to get API key', { error, userId, keyId });
      throw error;
    }
  }

  /**
   * Update API key
   */
  async updateApiKey(
    userId: string,
    keyId: string,
    updates: {
      name?: string;
      permissions?: string[];
      rateLimitRpm?: number;
      rateLimitTpm?: number;
      isActive?: boolean;
    },
  ): Promise<Omit<ApiKeyResponse, 'key'>> {
    try {
      const apiKey = await this.apiKeyModel.findById(keyId);

      if (!apiKey || apiKey.userId !== userId) {
        throw createNotFoundError('API key');
      }

      const updatedKey = await this.apiKeyModel.update(keyId, updates);
      if (!updatedKey) {
        throw createNotFoundError('API key');
      }

      logger.info('API key updated', {
        apiKeyId: keyId,
        userId,
        updates: Object.keys(updates),
      });

      return {
        id: updatedKey.id,
        name: updatedKey.name,
        permissions: updatedKey.permissions,
        rateLimitRpm: updatedKey.rateLimitRpm,
        rateLimitTpm: updatedKey.rateLimitTpm,
        isActive: updatedKey.isActive,
        createdAt: updatedKey.createdAt,
        lastUsedAt: updatedKey.lastUsedAt,
      };
    } catch (error) {
      logger.error('Failed to update API key', { error, userId, keyId, updates });
      throw error;
    }
  }

  /**
   * Delete API key
   */
  async deleteApiKey(userId: string, keyId: string): Promise<void> {
    try {
      const apiKey = await this.apiKeyModel.findById(keyId);

      if (!apiKey || apiKey.userId !== userId) {
        throw createNotFoundError('API key');
      }

      const deleted = await this.apiKeyModel.delete(keyId);
      if (!deleted) {
        throw createNotFoundError('API key');
      }

      logger.info('API key deleted', {
        apiKeyId: keyId,
        userId,
        name: apiKey.name,
      });
    } catch (error) {
      logger.error('Failed to delete API key', { error, userId, keyId });
      throw error;
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw createNotFoundError('User');
      }

      // Verify current password
      const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        throw createAuthError('Current password is incorrect');
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await this.userModel.update(userId, { passwordHash: newPasswordHash });

      logger.info('User password changed', { userId });
    } catch (error) {
      logger.error('Failed to change password', { error, userId });
      throw error;
    }
  }

  /**
   * Get maximum API keys allowed for a plan
   */
  private getMaxApiKeysForPlan(plan: string): number {
    switch (plan) {
      case 'free':
        return 2;
      case 'pro':
        return 10;
      case 'enterprise':
        return 50;
      default:
        return 2;
    }
  }

  /**
   * Get default rate limit RPM for a plan
   */
  private getDefaultRateLimitRpm(plan: string): number {
    switch (plan) {
      case 'free':
        return 60;
      case 'pro':
        return 300;
      case 'enterprise':
        return 1000;
      default:
        return 60;
    }
  }

  /**
   * Get default rate limit TPM for a plan
   */
  private getDefaultRateLimitTpm(plan: string): number {
    switch (plan) {
      case 'free':
        return 10000;
      case 'pro':
        return 50000;
      case 'enterprise':
        return 200000;
      default:
        return 10000;
    }
  }

  /**
   * Sanitize user object (remove sensitive data)
   */
  private sanitizeUser(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...sanitizedUser } = user;
    return sanitizedUser;
  }
}
