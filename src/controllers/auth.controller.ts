/**
 * Authentication controller
 * Handles user authentication, registration, and API key management endpoints
 */

import { Request, Response } from 'express';

import { AuthService } from '../services/auth.service.js';
import { validateRegisterRequest, validateLoginRequest, validateCreateApiKeyRequest } from '../utils/validation.util.js';
import { logger } from '../utils/logger.util.js';
import { asyncHandler } from '../middleware/error.middleware.js';

/**
 * Authentication controller class
 */
export class AuthController {
  private authService = new AuthService();

  /**
   * Register a new user
   * POST /auth/register
   */
  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const registerData = validateRegisterRequest(req.body);
    const ip = req.ip;

    const result = await this.authService.register(registerData, ip);

    res.status(201).json({
      success: true,
      data: result,
      message: 'User registered successfully',
    });
  });

  /**
   * Login user
   * POST /auth/login
   */
  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const loginData = validateLoginRequest(req.body);
    const ip = req.ip;

    const result = await this.authService.login(loginData, ip);

    res.json({
      success: true,
      data: result,
      message: 'Login successful',
    });
  });

  /**
   * Get user profile
   * GET /auth/profile
   */
  getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    const profile = await this.authService.getProfile(userId);

    res.json({
      success: true,
      data: profile,
    });
  });

  /**
   * Update user profile
   * PUT /auth/profile
   */
  updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const updates = req.body;

    // Validate updates
    const allowedFields = ['name', 'email'];
    const filteredUpdates: any = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      res.status(400).json({
        error: {
          message: 'No valid fields to update',
          type: 'validation_error',
          code: 'no_valid_fields',
        },
      });
      return;
    }

    const profile = await this.authService.updateProfile(userId, filteredUpdates);

    res.json({
      success: true,
      data: profile,
      message: 'Profile updated successfully',
    });
  });

  /**
   * Change password
   * POST /auth/change-password
   */
  changePassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        error: {
          message: 'Current password and new password are required',
          type: 'validation_error',
          code: 'missing_passwords',
        },
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        error: {
          message: 'New password must be at least 8 characters long',
          type: 'validation_error',
          code: 'password_too_short',
        },
      });
      return;
    }

    await this.authService.changePassword(userId, currentPassword, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  });

  /**
   * Create API key
   * POST /api-keys
   */
  createApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const keyData = validateCreateApiKeyRequest(req.body);
    const ip = req.ip;

    const apiKey = await this.authService.createApiKey(userId, keyData, ip);

    res.status(201).json({
      success: true,
      data: apiKey,
      message: 'API key created successfully',
    });
  });

  /**
   * List API keys
   * GET /api-keys
   */
  listApiKeys = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;

    const apiKeys = await this.authService.listApiKeys(userId);

    res.json({
      success: true,
      data: apiKeys,
    });
  });

  /**
   * Get API key details
   * GET /api-keys/:keyId
   */
  getApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const keyId = req.params.keyId;

    if (!keyId) {
      res.status(400).json({
        error: {
          message: 'API key ID is required',
          type: 'validation_error',
          code: 'missing_key_id',
        },
      });
      return;
    }

    const apiKey = await this.authService.getApiKey(userId, keyId);

    res.json({
      success: true,
      data: apiKey,
    });
  });

  /**
   * Update API key
   * PUT /api-keys/:keyId
   */
  updateApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const keyId = req.params.keyId;
    const updates = req.body;

    if (!keyId) {
      res.status(400).json({
        error: {
          message: 'API key ID is required',
          type: 'validation_error',
          code: 'missing_key_id',
        },
      });
      return;
    }

    // Validate updates
    const allowedFields = ['name', 'permissions', 'rateLimitRpm', 'rateLimitTpm', 'isActive'];
    const filteredUpdates: any = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    if (Object.keys(filteredUpdates).length === 0) {
      res.status(400).json({
        error: {
          message: 'No valid fields to update',
          type: 'validation_error',
          code: 'no_valid_fields',
        },
      });
      return;
    }

    const apiKey = await this.authService.updateApiKey(userId, keyId, filteredUpdates);

    res.json({
      success: true,
      data: apiKey,
      message: 'API key updated successfully',
    });
  });

  /**
   * Delete API key
   * DELETE /api-keys/:keyId
   */
  deleteApiKey = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const keyId = req.params.keyId;

    if (!keyId) {
      res.status(400).json({
        error: {
          message: 'API key ID is required',
          type: 'validation_error',
          code: 'missing_key_id',
        },
      });
      return;
    }

    await this.authService.deleteApiKey(userId, keyId);

    res.json({
      success: true,
      message: 'API key deleted successfully',
    });
  });

  /**
   * Get user usage statistics
   * GET /auth/usage
   */
  getUsageStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;

    if (days < 1 || days > 365) {
      res.status(400).json({
        error: {
          message: 'Days must be between 1 and 365',
          type: 'validation_error',
          code: 'invalid_days_range',
        },
      });
      return;
    }

    // Import UsageService here to avoid circular dependency
    const { UsageService } = await import('../services/usage.service');
    const usageService = new UsageService();
    
    const stats = await usageService.getUserUsageStats(userId, days);

    res.json({
      success: true,
      data: stats,
    });
  });

  /**
   * Get billing summary
   * GET /auth/billing
   */
  getBillingSummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      res.status(400).json({
        error: {
          message: 'Invalid date format',
          type: 'validation_error',
          code: 'invalid_date_format',
        },
      });
      return;
    }

    if (startDate >= endDate) {
      res.status(400).json({
        error: {
          message: 'Start date must be before end date',
          type: 'validation_error',
          code: 'invalid_date_range',
        },
      });
      return;
    }

    // Import UsageService here to avoid circular dependency
    const { UsageService } = await import('../services/usage.service');
    const usageService = new UsageService();
    
    const summary = await usageService.getBillingSummary(userId, startDate, endDate);

    res.json({
      success: true,
      data: summary,
    });
  });

  /**
   * Health check for auth service
   * GET /auth/health
   */
  healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'auth',
      },
    });
  });
}
