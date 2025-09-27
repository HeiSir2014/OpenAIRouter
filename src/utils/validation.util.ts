/**
 * Validation utilities
 * Input validation and sanitization functions
 */

import { z } from 'zod';

import { OpenAIRequest } from '../types/openai.types.js';
import { LoginRequest, RegisterRequest, CreateApiKeyRequest } from '../types/auth.types.js';

/**
 * Email validation schema
 */
export const emailSchema = z.string()
  .email('Invalid email format')
  .min(5, 'Email must be at least 5 characters')
  .max(255, 'Email must not exceed 255 characters')
  .toLowerCase();

/**
 * Password validation schema
 */
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 
    'Password must contain at least one lowercase letter, one uppercase letter, and one number');

/**
 * Name validation schema
 */
export const nameSchema = z.string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .regex(/^[a-zA-Z\s'-]+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes');

/**
 * API key name validation schema
 */
export const apiKeyNameSchema = z.string()
  .min(1, 'API key name is required')
  .max(100, 'API key name must not exceed 100 characters')
  .regex(/^[a-zA-Z0-9\s\-_]+$/, 'API key name can only contain letters, numbers, spaces, hyphens, and underscores');

/**
 * User registration validation
 */
export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

/**
 * User login validation
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

/**
 * API key creation validation
 */
export const createApiKeyRequestSchema = z.object({
  name: apiKeyNameSchema,
  permissions: z.array(z.string()).optional(),
  rateLimitRpm: z.number().int().min(1).max(10000).optional(),
  rateLimitTpm: z.number().int().min(100).max(1000000).optional(),
});

// Schemas are already exported above

/**
 * OpenAI request validation schema
 */
export const openaiRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.union([
      z.string(),
      z.array(z.object({
        type: z.enum(['text', 'image_url']),
        text: z.string().optional(),
        image_url: z.object({
          url: z.string().url(),
          detail: z.enum(['auto', 'low', 'high']).optional(),
        }).optional(),
      })),
      z.null(),
    ]),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(z.object({
      id: z.string(),
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
    })).optional(),
  })).optional(),
  prompt: z.string().optional(),
  model: z.string().optional(),
  max_tokens: z.number().int().min(1).max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  n: z.number().int().min(1).max(10).optional(),
  stream: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  user: z.string().optional(),
  seed: z.number().int().optional(),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      description: z.string().optional(),
      parameters: z.record(z.string(), z.unknown()),
    }),
  })).optional(),
  tool_choice: z.union([
    z.enum(['none', 'auto']),
    z.object({
      type: z.literal('function'),
      function: z.object({
        name: z.string(),
      }),
    }),
  ]).optional(),
  response_format: z.object({
    type: z.enum(['json_object', 'text']),
  }).optional(),
}).refine(
  data => data.messages || data.prompt,
  {
    message: 'Either messages or prompt must be provided',
    path: ['messages'],
  }
);

/**
 * Validate user registration data
 */
export const validateRegisterRequest = (data: unknown): RegisterRequest => {
  return registerRequestSchema.parse(data);
};

/**
 * Validate user login data
 */
export const validateLoginRequest = (data: unknown): LoginRequest => {
  return loginRequestSchema.parse(data);
};

/**
 * Validate API key creation data
 */
export const validateCreateApiKeyRequest = (data: unknown): CreateApiKeyRequest => {
  return createApiKeyRequestSchema.parse(data);
};

/**
 * Validate OpenAI request data
 */
export const validateOpenAIRequest = (data: unknown): OpenAIRequest => {
  return openaiRequestSchema.parse(data);
};

/**
 * Sanitize string input
 */
export const sanitizeString = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000); // Limit length
};

/**
 * Validate UUID format
 */
export const isValidUuid = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

/**
 * Validate email format (simple check)
 */
export const isValidEmail = (email: string): boolean => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate model name format
 */
export const isValidModelName = (model: string): boolean => {
  if (!model || typeof model !== 'string') {
    return false;
  }
  
  // Allow alphanumeric, hyphens, underscores, dots, and forward slashes
  const modelRegex = /^[a-zA-Z0-9\-_./]+$/;
  return modelRegex.test(model) && model.length <= 100;
};

/**
 * Validate provider name format
 */
export const isValidProviderName = (provider: string): boolean => {
  if (!provider || typeof provider !== 'string') {
    return false;
  }
  
  // Allow only lowercase letters, numbers, and hyphens
  const providerRegex = /^[a-z0-9\-]+$/;
  return providerRegex.test(provider) && provider.length <= 50;
};

/**
 * Validate pagination parameters
 */
export const validatePaginationParams = (query: any) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = ['asc', 'desc'].includes(query.sortOrder) ? query.sortOrder : 'desc';
  
  return { page, limit, sortBy, sortOrder };
};

/**
 * Validate and sanitize search query
 */
export const validateSearchQuery = (query: string): string => {
  if (!query || typeof query !== 'string') {
    return '';
  }
  
  return query
    .trim()
    .replace(/[^\w\s\-_.]/g, '') // Allow only word characters, spaces, hyphens, underscores, dots
    .substring(0, 100); // Limit length
};

/**
 * Create validation error response
 */
export const createValidationError = (error: z.ZodError) => {
  const errors = error.issues.map((err: any) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
  
  return {
    error: {
      message: 'Validation failed',
      type: 'validation_error',
      code: 'invalid_request',
      details: { errors },
    },
  };
};
