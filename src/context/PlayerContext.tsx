import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { MediaItem, PlayerType, PlaybackState } from '../types';
import { getSetting, setSetting } from '../api/settings';

const defaultPlaybackState: PlaybackState = {
  volume: 1.0,
  lastPosition: 0,
  rememberPosition: true,
};

// Context type
interface PlayerContextType {
  playingItem: MediaItem | null;
  playerType: PlayerType;
  startPlayback: (item: MediaItem, type: PlayerType) => void;
  stopPlayback: () => void;
  getPlaybackState: (itemId: string) => PlaybackState;
  updatePlaybackState: (itemId: string, updates: Partial<PlaybackState>) => void;
  setVolume: (volume: number) => void;
  savePosition: (position: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

// Provider component
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);
  const [playerType, setPlayerType] = useState<PlayerType>(null);
  const [playbackStates, setPlaybackStates] = useState<Record<string, PlaybackState>>({});

  // Load playback states from settings on mount
  useEffect(() => {
    const loadStates = async () => {
      try {
        const saved = await getSetting('playback_states');
        if (saved) {
          setPlaybackStates(JSON.parse(saved));
        }
      } catch {
        // Ignore
      }
    };
    loadStates();
  }, []);

  // Save playback states when changed
  const savePlaybackStates = useCallback(async (states: Record<string, PlaybackState>) => {
    try {
      await setSetting('playback_states', JSON.stringify(states));
    } catch {
      // Ignore
    }
  }, []);

  const getPlaybackState = useCallback((itemId: string): PlaybackState => {
    return playbackStates[itemId] || defaultPlaybackState;
  }, [playbackStates]);

  const updatePlaybackState = useCallback((
    itemId: string,
    updates: Partial<PlaybackState>
  ) => {
    setPlaybackStates((prev) => {
      const newStates = {
        ...prev,
        [itemId]: {
          ...getPlaybackState(itemId),
          ...updates,
        },
      };
      savePlaybackStates(newStates);
      return newStates;
    });
  }, [getPlaybackState, savePlaybackStates]);

  const setVolume = useCallback((volume: number) => {
    if (playingItem) {
      updatePlaybackState(playingItem.id, { volume });
    }
  }, [playingItem, updatePlaybackState]);

  const savePosition = useCallback((position: number) => {
    if (playingItem) {
      updatePlaybackState(playingItem.id, { lastPosition: position });
    }
  }, [playingItem, updatePlaybackState]);

  const startPlayback = useCallback((item: MediaItem, type: PlayerType) => {
    setPlayingItem(item);
    setPlayerType(type);
  }, []);

  const stopPlayback = useCallback(() => {
    setPlayingItem(null);
    setPlayerType(null);
  }, []);

  const value: PlayerContextType = {
    playingItem,
    playerType,
    startPlayback,
    stopPlayback,
    getPlaybackState,
    updatePlaybackState,
    setVolume,
    savePosition,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

// Hook to use context
export function usePlayer(): PlayerContextType {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
}

export default PlayerContext;