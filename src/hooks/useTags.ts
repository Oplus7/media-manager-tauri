import { useCallback } from 'react';
import { getAllTags, searchTags, checkSimilarTags, getItemTags, addTagToItem, removeTagFromItem } from '../api/tags';
import type { Tag, TagSimilarityResult } from '../types';

export function useTags() {
  // Get all tags
  const fetchAllTags = useCallback(async (): Promise<Tag[]> => {
    return getAllTags();
  }, []);

  // Search tags
  const search = useCallback(async (query: string): Promise<Tag[]> => {
    return searchTags(query);
  }, []);

  // Check similar tags
  const getSimilar = useCallback(async (name: string): Promise<TagSimilarityResult[]> => {
    return checkSimilarTags(name);
  }, []);

  // Get item tags
  const fetchItemTags = useCallback(async (itemId: string): Promise<Tag[]> => {
    return getItemTags(itemId);
  }, []);

  // Add tag to item
  const add = useCallback(async (itemId: string, tagName: string): Promise<Tag> => {
    return addTagToItem(itemId, tagName);
  }, []);

  // Remove tag from item
  const remove = useCallback(async (itemId: string, tagId: number): Promise<void> => {
    return removeTagFromItem(itemId, tagId);
  }, []);

  return {
    fetchAllTags,
    search,
    getSimilar,
    fetchItemTags,
    add,
    remove,
  };
}

export default useTags;