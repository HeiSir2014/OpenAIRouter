/**
 * Environment configuration loader
 * This file must be imported first to ensure environment variables are loaded
 * before any other configuration modules
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  override: true,
});

// Export a flag to indicate env has been loaded
export const ENV_LOADED = true;
