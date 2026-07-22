// Library and UI state types

import type { MediaItem, Category, SubFilter } from './media';

export interface LibraryFilters {
  category: Category;
  subFilter: SubFilter;
  search: string;
  sortBy: string;
  tagIds: number[] | null;
  tagMode: 'and' | 'or';
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Modal states
export interface ImportDialogState {
  open: boolean;
  paths: string[];
}

export interface DetailModalState {
  open: boolean;
  itemId: string | null;
}

export interface SettingsModalState {
  open: boolean;
}

// Player state
export type PlayerType = 'comic' | 'audio' | 'video' | null;

export interface PlaybackState {
  volume: number;
  lastPosition: number;
  rememberPosition: boolean;
}

export interface PlayerState {
  item: MediaItem | null;
  type: PlayerType;
  playbackStates: Record<string, PlaybackState>;
}

// App UI state (maintained in context)
export interface AppUIState {
  importDialog: ImportDialogState;
  detailModal: DetailModalState;
  settingsOpen: boolean;
  saveDataDirOpen: boolean;
  refreshTrigger: number;
  ragPanelOpen: boolean;
}

// App actions
export interface AppActions {
  openImportDialog: (paths: string[]) => void;
  closeImportDialog: () => void;
  openDetailModal: (itemId: string) => void;
  closeDetailModal: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openRagPanel: () => void;
  closeRagPanel: () => void;
  triggerRefresh: () => void;
  openSaveDataDirDialog: () => void;
  closeSaveDataDirDialog: () => void;
}

// Player actions
export interface PlayerActions {
  startPlayback: (item: MediaItem, type: PlayerType) => void;
  stopPlayback: () => void;
  getPlaybackState: (itemId: string) => PlaybackState;
  updatePlaybackState: (itemId: string, updates: Partial<PlaybackState>) => void;
}