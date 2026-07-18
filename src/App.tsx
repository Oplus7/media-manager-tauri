import { useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { checkSaveDataWritable, getSetting, listDirectoryFiles } from './api';
import { AppProvider, useApp, usePlayer, PlayerProvider } from './context';
import { QueryProvider } from './context/QueryContext';
import { useTheme, applyBackgroundSettings } from './hooks';
import ErrorBoundary from './components/ErrorBoundary';
import Library from './components/Library';
import ImportDialog from './components/ImportDialog';
import DetailModal from './components/DetailModal';
import ComicReader from './components/ComicReader';
import AudioPlayer from './components/AudioPlayer';
import VideoPlayer from './components/VideoPlayer';
import Settings from './components/Settings';
import SaveDataDirDialog from './components/SaveDataDirDialog';
import type { MediaItem, PlayMode } from './types';

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

// Inner component that uses context
function AppContent() {
  const { 
    importDialog, 
    detailModal, 
    settingsOpen, 
    saveDataDirOpen,
    refreshTrigger,
    openImportDialog, 
    closeImportDialog,
    openDetailModal,
    closeDetailModal,
    openSettings,
    closeSettings,
    triggerRefresh,
    openSaveDataDirDialog,
    closeSaveDataDirDialog
  } = useApp();
  
  const { playingItem, playerType, startPlayback, stopPlayback } = usePlayer();
  const { applyTheme, changeTheme } = useTheme();

  useEffect(() => {
    const loadBgSettings = async () => {
      try {
        const [savedBg, savedBgMode, savedBlur, savedCoverTrans] = await Promise.all([
          getSetting('custom_bg'),
          getSetting('bg_mode'),
          getSetting('blur_level'),
          getSetting('cover_transparent'),
        ]);
        const bgPath = savedBg || null;
        const mode = (savedBgMode as 'full' | 'library') || 'full';
        const blur = savedBlur ? parseInt(savedBlur, 10) : 0;
        const coverTrans = savedCoverTrans !== 'false';
        await applyBackgroundSettings(bgPath, mode, blur, coverTrans);
      } catch {
        // ignore
      }
    };
    loadBgSettings();
  }, []);

  // Check writable on mount
  useEffect(() => {
    const checkWritable = async () => {
      try {
        const ok = await checkSaveDataWritable();
        if (!ok) {
          openSaveDataDirDialog();
        }
      } catch {
        openSaveDataDirDialog();
      }
    };
    checkWritable();
    applyTheme();
  }, []);

  // Listen for drag-drop
  useEffect(() => {
    const unlistenDrop = listen<DragDropPayload>('tauri://drag-drop', (event) => {
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        openImportDialog(paths);
      }
    });

    return () => {
      unlistenDrop.then((fn) => fn());
    };
  }, [openImportDialog]);

  const handleImportClick = async () => {
    try {
      const selected = await open({
        title: '选择文件或文件夹',
        multiple: true,
      });
      if (selected && selected.length > 0) {
        const paths = selected.map((p) => (typeof p === 'string' ? p : p));
        openImportDialog(paths);
      }
    } catch (err) {
      console.error('Failed to open import dialog:', err);
    }
  };

  const handleImported = () => {
    triggerRefresh();
    closeImportDialog();
  };

  const handleItemClick = (id: string) => {
    openDetailModal(id);
  };

  const handlePlay = async (item: MediaItem) => {
    try {
      const mode = await getSetting('play_mode');
      const playMode: PlayMode = (mode as PlayMode) || 'builtin';

      if (playMode === 'system') {
        window.open(convertFileSrc(item.path));
        return;
      }

      let actualPlayerType: 'comic' | 'audio' | 'video' = item.media_type as 'comic' | 'audio' | 'video';

      if (item.media_type === 'audio') {
        const files = item.is_series ? await listDirectoryFiles(item.path) : [item.path];
        const hasVideo = files.some((f) => {
          const ext = f.split('.').pop()?.toLowerCase() || '';
          return ['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext);
        });
        if (hasVideo) {
          actualPlayerType = 'video';
        }
      }

      startPlayback(item, actualPlayerType);
      closeDetailModal();
    } catch {
      startPlayback(item, item.media_type as 'comic' | 'audio' | 'video');
    }
  };

  const handlePlayerClose = () => {
    stopPlayback();
  };

  const handleRequestSelectDir = async () => {
    try {
      const selected = await open({
        title: '选择 SaveData 目录',
        directory: true,
        multiple: false,
      });
      if (selected) {
        const path = typeof selected === 'string' ? selected : selected[0];
        if (path) {
          closeSaveDataDirDialog();
          triggerRefresh();
        }
      }
    } catch (err) {
      console.error('Failed to select save data directory:', err);
    }
  };

  return (
    <div className="app-container">
      <div className="app-bg-layer" />
      <div className="app-content-layer">
        <Library
          onImportClick={handleImportClick}
          onSettingsClick={openSettings}
          onItemClick={handleItemClick}
          onPlay={handlePlay}
          refreshTrigger={refreshTrigger}
        />

        <ImportDialog
          open={importDialog.open}
          onClose={closeImportDialog}
          onImported={handleImported}
          initialPaths={importDialog.paths}
        />

        <DetailModal
          itemId={detailModal.itemId}
          open={detailModal.open}
          onClose={closeDetailModal}
          onPlay={handlePlay}
          onDeleted={triggerRefresh}
          onTagsChanged={triggerRefresh}
          onUpdated={triggerRefresh}
        />

        <Settings open={settingsOpen} onClose={closeSettings} onThemeChange={changeTheme} />

        <SaveDataDirDialog
          open={saveDataDirOpen}
          onClose={closeSaveDataDirDialog}
          onRequestSelectDir={handleRequestSelectDir}
        />

        {playerType === 'comic' && playingItem && <ComicReader item={playingItem} onClose={handlePlayerClose} />}
        {playerType === 'audio' && playingItem && <AudioPlayer item={playingItem} onClose={handlePlayerClose} />}
        {playerType === 'video' && playingItem && <VideoPlayer item={playingItem} onClose={handlePlayerClose} />}
      </div>
    </div>
  );
}

// Root component with providers
export default function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AppProvider>
          <PlayerProvider>
            <AppContent />
          </PlayerProvider>
        </AppProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}