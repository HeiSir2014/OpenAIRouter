/**
 * Cryptographic utilities
 * Secure password hashing and API key generation
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { getJwtConfig } from '../config/app.config.js';
import { JwtPayload, User } from '../types/auth.types.js';

/**
 * Salt rounds for bcrypt hashing
 */
const SALT_ROUNDS = 12;

/**
 * API key prefix for identification
 */
const API_KEY_PREFIX = 'oar_'; // OpenAI Router prefix

/**
 * Hash a password using bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Verify a password against its hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  if (!password || !hash) {
    return false;
  }
  
  return bcrypt.compare(password, hash);
};

/**
 * Generate a secure API key
 */
export const generateApiKey = (): string => {
  // Generate 32 random bytes and encode as base64
  const randomBytes = crypto.randomBytes(32);
  const base64Key = randomBytes.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${API_KEY_PREFIX}${base64Key}`;
};

/**
 * Hash an API key for storage
 */
export const hashApiKey = (apiKey: string): string => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

/**
 * Verify an API key against its hash
 */
export const verifyApiKey = (apiKey: string, hash: string): boolean => {
  const computedHash = hashApiKey(apiKey);
  return crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(hash, 'hex')
  );
};

/**
 * Generate a JWT token for a user
 */
export const generateJwtToken = (user: User): string => {
  const config = getJwtConfig();
  
  const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    plan: user.plan,
  };
  
  if (!config.secret) {
    throw new Error('JWT secret is required');
  }
  
  return jwt.sign(payload, config.secret, {
    expiresIn: config.expiresIn as any,
    algorithm: config.algorithm as jwt.Algorithm,
  });
};

/**
 * Verify and decode a JWT token
 */
export const verifyJwtToken = (token: string): JwtPayload => {
  const config = getJwtConfig();
  
  try {
    return jwt.verify(token, config.secret, {
      algorithms: [config.algorithm],
    }) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    throw new Error('Token verification failed');
  }
};

/**
 * Generate a secure random string
 */
export const generateRandomString = (length: number = 32): string => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Generate a UUID v4
 */
export const generateUuid = (): string => {
  return crypto.randomUUID();
};

/**
 * Create a secure hash of any string
 */
export const createHash = (input: string, algorithm: string = 'sha256'): string => {
  return crypto.createHash(algorithm).update(input).digest('hex');
};

/**
 * Create HMAC signature
 */
export const createHmacSignature = (
  data: string, 
  secret: string, 
  algorithm: string = 'sha256'
): string => {
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
};

/**
 * Verify HMAC signature
 */
export const verifyHmacSignature = (
  data: string,
  signature: string,
  secret: string,
  algorithm: string = 'sha256'
): boolean => {
  const expectedSignature = createHmacSignature(data, secret, algorithm);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

/**
 * Encrypt sensitive data
 */
export const encrypt = (text: string, key: string): { encrypted: string; iv: string } => {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
  };
};

/**
 * Decrypt sensitive data
 */
export const decrypt = (encryptedData: { encrypted: string; iv: string }, key: string): string => {
  const algorithm = 'aes-256-gcm';
  const iv = Buffer.from(encryptedData.iv, 'hex');
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

/**
 * Validate API key format
 */
export const isValidApiKeyFormat = (apiKey: string): boolean => {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Check prefix
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return false;
  }
  
  // Check length (prefix + base64 encoded 32 bytes)
  const expectedLength = API_KEY_PREFIX.length + 43; // 43 chars for base64 encoded 32 bytes
  if (apiKey.length !== expectedLength) {
    return false;
  }
  
  // Check base64 format (URL-safe)
  const keyPart = apiKey.substring(API_KEY_PREFIX.length);
  const base64Regex = /^[A-Za-z0-9_-]+$/;
  
  return base64Regex.test(keyPart);
};
