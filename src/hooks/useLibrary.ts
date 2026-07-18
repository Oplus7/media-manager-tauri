import { useState, useCallback, useEffect } from 'react';
import { queryLibrary } from '../api/library';
import type { MediaItem, LibraryFilters, LibraryResult } from '../types';

const DEFAULT_PAGE_SIZE = 50;

export function useLibraryQuery(defaultPageSize: number = DEFAULT_PAGE_SIZE) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [filters, setFilters] = useState<LibraryFilters>({
    category: 'all',
    subFilter: null,
    search: '',
    sortBy: 'updated_desc',
    tagIds: null,
    tagMode: 'or',
  });
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(total / pageSize);

  const buildQuery = useCallback(() => ({
    category: filters.category,
    sub_filter: filters.subFilter,
    search: filters.search || null,
    tag_ids: filters.tagIds,
    tag_mode: filters.tagMode,
    page,
    page_size: pageSize,
    sort_by: filters.sortBy,
  }), [filters, page, pageSize]);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const result: LibraryResult = await queryLibrary(buildQuery());
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load library:', err);
    }
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const updateFilter = useCallback(<K extends keyof LibraryFilters>(
    key: K,
    value: LibraryFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      category: 'all',
      subFilter: null,
      search: '',
      sortBy: 'updated_desc',
      tagIds: null,
      tagMode: 'or',
    });
    setPage(1);
  }, []);

  const nextPage = useCallback(() => {
    if (page < totalPages) setPage((p) => p + 1);
  }, [page, totalPages]);

  const prevPage = useCallback(() => {
    if (page > 1) setPage((p) => p - 1);
  }, [page]);

  const goToPage = useCallback((p: number) => {
    if (p >= 1 && p <= totalPages) setPage(p);
  }, [totalPages]);

  return {
    items,
    total,
    page,
    pageSize,
    setPageSize,
    totalPages,
    filters,
    loading,
    updateFilter,
    resetFilters,
    nextPage,
    prevPage,
    goToPage,
    reload: loadLibrary,
  };
}

export default useLibraryQuery;