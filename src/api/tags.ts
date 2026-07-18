import { invoke } from '@tauri-apps/api/core';
import type { Tag, TagWithCount, TagSimilarityResult } from '../types';

export async function getAllTags(): Promise<Tag[]> {
  return invoke<Tag[]>('get_all_tags');
}

export async function getTagsWithCounts(): Promise<TagWithCount[]> {
  return invoke<TagWithCount[]>('get_tags_with_counts');
}

export async function searchTags(query: string): Promise<Tag[]> {
  return invoke<Tag[]>('search_tags', { query });
}

export async function checkSimilarTags(name: string): Promise<TagSimilarityResult[]> {
  return invoke<TagSimilarityResult[]>('check_similar_tags', { name });
}

export async function getItemTags(itemId: string): Promise<Tag[]> {
  return invoke<Tag[]>('get_item_tags', { itemId });
}

export async function addTagToItem(itemId: string, tagName: string): Promise<Tag> {
  return invoke<Tag>('add_tag_to_item', { itemId, tagName });
}

export async function removeTagFromItem(itemId: string, tagId: number): Promise<void> {
  return invoke<void>('remove_tag_from_item', { itemId, tagId });
}