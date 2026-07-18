import { invoke } from '@tauri-apps/api/core';
import type { ImportCandidate, MediaItem } from '../types';

// Media import API - handles file import and processing

/**
 * Import paths and get candidates
 */
export async function importPaths(paths: string[]): Promise<ImportCandidate[]> {
  return invoke<ImportCandidate[]>('import_paths', { paths });
}

/**
 * Confirm import with tags
 */
export async function confirmImport(
  candidate: ImportCandidate,
  tagNames: string[]
): Promise<MediaItem> {
  return invoke<MediaItem>('confirm_import', { candidate, tagNames });
}

/**
 * List files in directory
 */
export async function listDirectoryFiles(dirPath: string): Promise<string[]> {
  return invoke<string[]>('list_directory_files', { dirPath });
}

/**
 * Read image as base64
 */
export async function readImageAsBase64(imagePath: string): Promise<string> {
  return invoke<string>('read_image_as_base64', { imagePath });
}

export async function readImageAsBase64Resized(
  imagePath: string,
  maxWidth: number,
  maxHeight: number
): Promise<string> {
  return invoke<string>('read_image_as_base64_resized', { imagePath, maxWidth, maxHeight });
}

/**
 * Extract video thumbnail
 */
export async function extractVideoThumbnail(videoPath: string): Promise<string | null> {
  return invoke<string | null>('extract_video_thumbnail', { videoPath });
}