import { invoke } from '@tauri-apps/api/core';
import type { MediaItem, Series } from '../types';

export async function createSeries(
  name: string,
  description: string | null,
  author: string | null
): Promise<Series> {
  return invoke<Series>('create_series', { name, description, author });
}

export async function getSeriesList(): Promise<Series[]> {
  return invoke<Series[]>('get_series_list');
}

export async function getSeriesDetail(seriesId: string): Promise<Series | null> {
  return invoke<Series | null>('get_series_detail', { seriesId });
}

export async function addItemToSeries(seriesId: string, itemId: string): Promise<void> {
  return invoke<void>('add_item_to_series', { seriesId, itemId });
}

export async function removeItemFromSeries(seriesId: string, itemId: string): Promise<void> {
  return invoke<void>('remove_item_from_series', { seriesId, itemId });
}

export async function deleteSeries(seriesId: string): Promise<void> {
  return invoke<void>('delete_series', { seriesId });
}

export async function getAvailableItemsForSeries(
  seriesId: string | null,
  mediaType: string
): Promise<MediaItem[]> {
  return invoke<MediaItem[]>('get_available_items_for_series', { seriesId, mediaType });
}
