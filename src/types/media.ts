// Type definitions for the application

export interface MediaItem {
  id: string;
  name: string;
  media_type: string;
  is_series: boolean;
  path: string;
  cover_path: string | null;
  author: string | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tags?: Tag[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface TagWithCount {
  id: number;
  name: string;
  count: number;
}

export interface ImportCandidate {
  path: string;
  name: string;
  media_type: string;
  is_series: boolean;
  cover_path: string | null;
  author: string | null;
  description: string | null;
  files: string[];
}

export interface LibraryQuery {
  category: string;
  sub_filter: string | null;
  search: string | null;
  tag_ids: number[] | null;
  tag_mode: 'and' | 'or';
  page: number;
  page_size: number;
  sort_by?: string;
}

export interface LibraryResult {
  items: MediaItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface TagSimilarityResult {
  existing_tag: string;
  similarity: number;
}

export interface Series {
  id: string;
  name: string;
  description: string | null;
  author: string | null;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
  items?: MediaItem[];
  tags?: Tag[];
}

export type Category = 'all' | 'comic' | 'audio' | 'video';
export type SubFilter = 'series' | 'single' | null;
export type PlayMode = 'builtin' | 'system';