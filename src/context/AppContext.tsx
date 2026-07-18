import React, { createContext, useContext, useState, useCallback } from 'react';
import type { AppUIState, AppActions, ImportDialogState, DetailModalState } from '../types';

const initialImportDialog: ImportDialogState = {
  open: false,
  paths: [],
};

const initialDetailModal: DetailModalState = {
  open: false,
  itemId: null,
};

// Context type
interface AppContextType extends AppUIState, AppActions {}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [importDialog, setImportDialog] = useState<ImportDialogState>(initialImportDialog);
  const [detailModal, setDetailModal] = useState<DetailModalState>(initialDetailModal);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveDataDirOpen, setSaveDataDirOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const openImportDialog = useCallback((paths: string[]) => {
    setImportDialog({ open: true, paths });
  }, []);

  const closeImportDialog = useCallback(() => {
    setImportDialog(initialImportDialog);
  }, []);

  const openDetailModal = useCallback((itemId: string) => {
    setDetailModal({ open: true, itemId });
  }, []);

  const closeDetailModal = useCallback(() => {
    setDetailModal(initialDetailModal);
  }, []);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1);
  }, []);

  const openSaveDataDirDialog = useCallback(() => {
    setSaveDataDirOpen(true);
  }, []);

  const closeSaveDataDirDialog = useCallback(() => {
    setSaveDataDirOpen(false);
  }, []);

  const value: AppContextType = {
    // State
    importDialog,
    detailModal,
    settingsOpen,
    saveDataDirOpen,
    refreshTrigger,
    // Actions
    openImportDialog,
    closeImportDialog,
    openDetailModal,
    closeDetailModal,
    openSettings,
    closeSettings,
    triggerRefresh,
    openSaveDataDirDialog,
    closeSaveDataDirDialog,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// Hook to use context
export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

export default AppContext;