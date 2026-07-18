import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { queryLibrary, getItemDetail, updateItem, deleteItem } from '../api/library';
import { confirmImport } from '../api/media';
import { getAllTags, searchTags, checkSimilarTags, getItemTags, addTagToItem, removeTagFromItem } from '../api/tags';
import { getSeriesList, getSeriesDetail } from '../api/series';
import type { LibraryQuery, MediaItem, ImportCandidate } from '../types';

export function useLibrary(query: LibraryQuery, enabled: boolean = true, refreshTrigger: number = 0) {
  return useQuery({
    queryKey: ['library', query, refreshTrigger],
    queryFn: () => queryLibrary(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useItemDetail(id: string | null) {
  return useQuery({
    queryKey: ['item', id],
    queryFn: () => getItemDetail(id!),
    enabled: !!id,
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (item: MediaItem) => updateItem(item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
      queryClient.invalidateQueries({ queryKey: ['item'] });
    },
  });
}

export function useConfirmImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ candidate, tagNames }: { candidate: ImportCandidate; tagNames: string[] }) =>
      confirmImport(candidate, tagNames),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useAllTags() {
  return useQuery({
    queryKey: ['tags', 'all'],
    queryFn: getAllTags,
  });
}

export function useSearchTags(query: string) {
  return useQuery({
    queryKey: ['tags', 'search', query],
    queryFn: () => searchTags(query),
    enabled: query.trim().length > 0,
  });
}

export function useSimilarTags(name: string) {
  return useQuery({
    queryKey: ['tags', 'similar', name],
    queryFn: () => checkSimilarTags(name),
    enabled: name.trim().length > 0,
  });
}

export function useItemTags(itemId: string | null) {
  return useQuery({
    queryKey: ['tags', 'item', itemId],
    queryFn: () => getItemTags(itemId!),
    enabled: !!itemId,
  });
}

export function useAddTagToItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, tagName }: { itemId: string; tagName: string }) =>
      addTagToItem(itemId, tagName),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['tags', 'item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['tags', 'all'] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useRemoveTagFromItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, tagId }: { itemId: string; tagId: number }) =>
      removeTagFromItem(itemId, tagId),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['tags', 'item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['library'] });
    },
  });
}

export function useSeriesList() {
  return useQuery({
    queryKey: ['series', 'list'],
    queryFn: getSeriesList,
  });
}

export function useSeriesDetail(seriesId: string | null) {
  return useQuery({
    queryKey: ['series', 'detail', seriesId],
    queryFn: () => getSeriesDetail(seriesId!),
    enabled: !!seriesId,
  });
}
