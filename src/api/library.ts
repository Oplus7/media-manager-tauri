import { invoke } from '@tauri-apps/api/core';
import type { LibraryQuery, LibraryResult, MediaItem } from '../types';

export async function queryLibrary(query: LibraryQuery): Promise<LibraryResult> {
  return invoke<LibraryResult>('query_library', { query });
}

export async function getItemDetail(id: string): Promise<MediaItem | null> {
  return invoke<MediaItem | null>('get_item_detail', { id });
}

export async function updateItem(item: MediaItem): Promise<void> {
  return invoke<void>('update_item', { item });
}

export async function deleteItem(id: string): Promise<void> {
  return invoke<void>('delete_item', { id });
}

export async function exportLibrary(): Promise<string> {
  return invoke<string>('export_library');
}

export async function exportLibraryToFile(filePath: string): Promise<string> {
  return invoke<string>('export_library_to_file', { filePath });
}

export async function importLibrary(jsonData: string): Promise<string> {
  return invoke<string>('import_library', { jsonData });
}

export async function importLibraryFromFile(filePath: string): Promise<string> {
  return invoke<string>('import_library_from_file', { filePath });
}
