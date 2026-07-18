import { useState, useCallback } from 'react';
import { searchTags, checkSimilarTags } from '../api/tags';
import type { Tag, TagSimilarityResult } from '../types';

export interface TagFilterState {
  selectedTags: number[];
  tagMode: 'and' | 'or';
}

export function useTagFilter(initialTags: number[] = [], initialMode: 'and' | 'or' = 'or') {
  const [selectedTags, setSelectedTags] = useState<number[]>(initialTags);
  const [tagMode, setTagMode] = useState<'and' | 'or'>(initialMode);

  const toggleTag = useCallback((tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }, []);

  const clearTags = useCallback(() => {
    setSelectedTags([]);
  }, []);

  const searchTagsByName = useCallback(async (query: string): Promise<Tag[]> => {
    return searchTags(query);
  }, []);

  const getSimilarTags = useCallback(async (name: string): Promise<TagSimilarityResult[]> => {
    return checkSimilarTags(name);
  }, []);

  return {
    selectedTags,
    tagMode,
    setSelectedTags,
    setTagMode,
    toggleTag,
    clearTags,
    searchTagsByName,
    getSimilarTags,
  };
}

export default useTagFilter;