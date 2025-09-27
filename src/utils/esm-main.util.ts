/**
 * ESM entry point detection utilities
 * Cross-platform compatible solution for detecting if a module is run directly
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

/**
 * Normalize filesystem path for cross-platform comparison
 * Handles Windows case-insensitivity, path separators, and symbolic links
 */
function normalizeFsPath(p: string): string {
  try {
    // Resolve real path to handle symbolic links and 8.3 short names
    const real = (fs.realpathSync.native ?? fs.realpathSync)(p);
    let abs = path.resolve(real);
    
    if (process.platform === 'win32') {
      // Normalize to backslashes and lowercase for Windows
      abs = abs.replace(/\//g, '\\').toLowerCase();
    }
    
    return abs;
  } catch (error) {
    // Fallback to basic path resolution if realpathSync fails
    let abs = path.resolve(p);
    
    if (process.platform === 'win32') {
      abs = abs.replace(/\//g, '\\').toLowerCase();
    }
    
    return abs;
  }
}

/**
 * Check if the current module is the main entry point
 * Cross-platform compatible alternative to require.main === module
 * 
 * @param metaUrl - import.meta.url of the current module
 * @param argv - process.argv (defaults to process.argv)
 * @returns true if this module is the main entry point
 */
export function isMain(metaUrl: string, argv = process.argv): boolean {
  if (!metaUrl || !argv?.[1]) {
    return false;
  }
  
  try {
    const selfPath = normalizeFsPath(fileURLToPath(metaUrl));
    const argvPath = normalizeFsPath(argv[1]);
    
    return selfPath === argvPath;
  } catch (error) {
    // Fallback to simple comparison if path normalization fails
    try {
      const selfPath = path.resolve(fileURLToPath(metaUrl)).toLowerCase();
      const argvPath = path.resolve(argv[1]).toLowerCase();
      
      return selfPath === argvPath;
    } catch {
      return false;
    }
  }
}

/**
 * Simplified version for basic use cases
 * Less robust but sufficient for most scenarios
 */
export function isMainSimple(metaUrl: string): boolean {
  return !!process.argv[1] && 
    path.resolve(fileURLToPath(metaUrl)).toLowerCase() === 
    path.resolve(process.argv[1]).toLowerCase();
}
