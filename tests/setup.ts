/**
 * Test setup file
 * Global test configuration and utilities
 */

import { DatabaseConnection } from '../src/database/connection';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.DB_PATH = ':memory:'; // Use in-memory database for tests

/**
 * Setup before all tests
 */
beforeAll(async () => {
  // Initialize test database
  await DatabaseConnection.initialize();
});

/**
 * Cleanup after all tests
 */
afterAll(async () => {
  // Close database connection
  DatabaseConnection.close();
});

/**
 * Reset database before each test
 */
beforeEach(async () => {
  // Clear all tables
  const db = DatabaseConnection.getInstance();
  
  db.exec('DELETE FROM usage_logs');
  db.exec('DELETE FROM api_keys');
  db.exec('DELETE FROM users');
});

/**
 * Test utilities
 */
export const testUtils = {
  /**
   * Create a test user
   */
  async createTestUser() {
    const { UserModel } = await import('../src/database/models/user.model');
    const { hashPassword } = await import('../src/utils/crypto.util');
    
    const userModel = new UserModel();
    const passwordHash = await hashPassword('testpassword123');
    
    return userModel.create({
      email: 'test@example.com',
      name: 'Test User',
      passwordHash,
      plan: 'free',
      credits: 100,
    });
  },

  /**
   * Create a test API key
   */
  async createTestApiKey(userId: string) {
    const { ApiKeyModel } = await import('../src/database/models/api-key.model');
    const { generateApiKey, hashApiKey } = await import('../src/utils/crypto.util');
    
    const apiKeyModel = new ApiKeyModel();
    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);
    
    const savedKey = await apiKeyModel.create({
      userId,
      keyHash,
      name: 'Test API Key',
      permissions: [],
      rateLimitRpm: 60,
      rateLimitTpm: 10000,
    });
    
    return { apiKey, savedKey };
  },

  /**
   * Generate test JWT token
   */
  async generateTestToken(user: any) {
    const { generateJwtToken } = await import('../src/utils/crypto.util');
    return generateJwtToken(user);
  },
};
