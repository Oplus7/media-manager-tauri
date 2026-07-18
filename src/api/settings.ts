import { invoke } from '@tauri-apps/api/core';

// Settings API - app settings management

/**
 * Get setting value
 */
export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>('get_setting', { key });
}

/**
 * Set setting value
 */
export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>('set_setting', { key, value });
}

/**
 * Check if save data directory is writable
 */
export async function checkSaveDataWritable(): Promise<boolean> {
  return invoke<boolean>('check_save_data_writable');
}

/**
 * Get current save data directory
 */
export async function getSaveDataDir(): Promise<string> {
  return invoke<string>('get_save_data_dir');
}

/**
 * Select new save data directory
 */
export async function selectSaveDataDir(dirPath: string): Promise<string> {
  return invoke<string>('select_save_data_dir', { dirPath });
}