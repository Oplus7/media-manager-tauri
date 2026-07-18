import { useState, useEffect, useCallback } from 'react';
import { getSetting } from '../api/settings';

export interface ColorScheme {
  name: string;
  key: string;
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  bgElevated: string;
  bgHover: string;
  bgModal: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentDim: string;
  accentGlow: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  mediaComic: string;
  mediaComicDim: string;
  mediaAudio: string;
  mediaAudioDim: string;
  mediaVideo: string;
  mediaVideoDim: string;
}

// ============================================
// 基础主题：亮色
// ============================================
const LIGHT_THEME: ColorScheme = {
  name: '亮色',
  key: 'light',
  bgPrimary: '#fafafa',
  bgSecondary: '#f0f0f5',
  bgCard: '#ffffff',
  bgElevated: '#f8f8fc',
  bgHover: '#f0f0f8',
  bgModal: '#ffffff',
  textPrimary: '#1a1a2e',
  textSecondary: '#5a5a72',
  textMuted: '#9090a8',
  accent: '#6366f1',
  accentHover: '#4f46e5',
  accentDim: 'rgba(99, 102, 241, 0.12)',
  accentGlow: 'rgba(99, 102, 241, 0.2)',
  border: '#e4e4ec',
  borderLight: '#ececf2',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 护眼主题
// ============================================
const EYECARE_THEME: ColorScheme = {
  name: '护眼',
  key: 'eyecare',
  bgPrimary: '#1c1917',
  bgSecondary: '#292524',
  bgCard: '#343230',
  bgElevated: '#3d3a37',
  bgHover: '#474440',
  bgModal: '#343230',
  textPrimary: '#faf5f0',
  textSecondary: '#d6d3d1',
  textMuted: '#a8a29e',
  accent: '#d97706',
  accentHover: '#ea9a1e',
  accentDim: 'rgba(217, 119, 6, 0.25)',
  accentGlow: 'rgba(217, 119, 6, 0.35)',
  border: '#44403c',
  borderLight: '#57534e',
  success: '#65a30d',
  warning: '#d97706',
  error: '#dc2626',
  info: '#0284c7',
  mediaComic: '#ea580c',
  mediaComicDim: 'rgba(234, 88, 12, 0.2)',
  mediaAudio: '#0891b2',
  mediaAudioDim: 'rgba(8, 145, 178, 0.2)',
  mediaVideo: '#db2777',
  mediaVideoDim: 'rgba(219, 39, 119, 0.2)',
};

// ============================================
// 琥珀暖阳 - 暗色
// ============================================
const AMBER_DARK_THEME: ColorScheme = {
  name: '琥珀·暗',
  key: 'amber-dark',
  bgPrimary: '#1c1408',
  bgSecondary: '#281f10',
  bgCard: '#342918',
  bgElevated: '#403220',
  bgHover: '#4c3c28',
  bgModal: '#281f10',
  textPrimary: '#fef3c7',
  textSecondary: '#fde68a',
  textMuted: '#b88a4a',
  accent: '#f59e0b',
  accentHover: '#d97706',
  accentDim: 'rgba(245, 158, 11, 0.3)',
  accentGlow: 'rgba(245, 158, 11, 0.4)',
  border: '#3d2c18',
  borderLight: '#4d3c28',
  success: '#4ade80',
  warning: '#f59e0b',
  error: '#f87171',
  info: '#60a5fa',
  mediaComic: '#ff7b54',
  mediaComicDim: 'rgba(255, 123, 84, 0.2)',
  mediaAudio: '#54c6ff',
  mediaAudioDim: 'rgba(84, 198, 255, 0.2)',
  mediaVideo: '#ff54b2',
  mediaVideoDim: 'rgba(255, 84, 178, 0.2)',
};

// ============================================
// 琥珀暖阳 - 亮色
// ============================================
const AMBER_LIGHT_THEME: ColorScheme = {
  name: '琥珀·亮',
  key: 'amber-light',
  bgPrimary: '#fffbeb',
  bgSecondary: '#fef3c7',
  bgCard: '#ffffff',
  bgElevated: '#fffbeb',
  bgHover: '#fef3c7',
  bgModal: '#ffffff',
  textPrimary: '#78350f',
  textSecondary: '#92400e',
  textMuted: '#b88a4a',
  accent: '#f59e0b',
  accentHover: '#d97706',
  accentDim: 'rgba(245, 158, 11, 0.15)',
  accentGlow: 'rgba(245, 158, 11, 0.25)',
  border: '#fde68a',
  borderLight: '#fde68a',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 玫瑰粉 - 亮色
// ============================================
const ROSE_LIGHT_THEME: ColorScheme = {
  name: '玫瑰·亮',
  key: 'rose-light',
  bgPrimary: '#fdf2f8',
  bgSecondary: '#fce7f3',
  bgCard: '#ffffff',
  bgElevated: '#fdf2f8',
  bgHover: '#fce7f3',
  bgModal: '#ffffff',
  textPrimary: '#831843',
  textSecondary: '#a21caf',
  textMuted: '#c97ab5',
  accent: '#ec4899',
  accentHover: '#db2777',
  accentDim: 'rgba(236, 72, 153, 0.15)',
  accentGlow: 'rgba(236, 72, 153, 0.25)',
  border: '#fbcfe8',
  borderLight: '#fce7f3',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.15)',
};

// ============================================
// 珊瑚海
// #fee2e2 浅背景, #f87171 中间色, #ef4444 主色, #b91c1c 深色
// #fef9c3 辅助浅色, #fbbf24 强调色
// ============================================
const CORAL_THEME: ColorScheme = {
  name: '珊瑚海',
  key: 'coral',
  bgPrimary: '#fef2f2',
  bgSecondary: '#fee2e2',
  bgCard: '#ffffff',
  bgElevated: '#fef2f2',
  bgHover: '#fecaca',
  bgModal: '#ffffff',
  textPrimary: '#7f1d1d',
  textSecondary: '#991b1b',
  textMuted: '#b91c1c',
  accent: '#ef4444',
  accentHover: '#dc2626',
  accentDim: 'rgba(239, 68, 68, 0.15)',
  accentGlow: 'rgba(239, 68, 68, 0.25)',
  border: '#fecaca',
  borderLight: '#fee2e2',
  success: '#22c55e',
  warning: '#fbbf24',
  error: '#ef4444',
  info: '#3b82f6',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 森林绿
// #d1fae5 浅背景, #34d399 中间色, #10b981 主色, #047858 深色
// #e0e7ff 辅助浅色, #6366f1 辅助色
// ============================================
const FOREST_THEME: ColorScheme = {
  name: '森林绿',
  key: 'forest',
  bgPrimary: '#ecfdf5',
  bgSecondary: '#d1fae5',
  bgCard: '#ffffff',
  bgElevated: '#ecfdf5',
  bgHover: '#a7f3d0',
  bgModal: '#ffffff',
  textPrimary: '#022c22',
  textSecondary: '#064e3b',
  textMuted: '#047857',
  accent: '#10b981',
  accentHover: '#059669',
  accentDim: 'rgba(16, 185, 129, 0.15)',
  accentGlow: 'rgba(16, 185, 129, 0.25)',
  border: '#a7f3d0',
  borderLight: '#d1fae5',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#6366f1',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 落日橙
// #ffedd5 浅背景, #fdba74 中间色, #f97316 主色, #c2410c 深色
// #fef3c7 辅助浅色, #d07706 辅助色
// ============================================
const SUNSET_THEME: ColorScheme = {
  name: '落日橙',
  key: 'sunset',
  bgPrimary: '#fff7ed',
  bgSecondary: '#ffedd5',
  bgCard: '#ffffff',
  bgElevated: '#fff7ed',
  bgHover: '#fed7aa',
  bgModal: '#ffffff',
  textPrimary: '#431407',
  textSecondary: '#7c2d12',
  textMuted: '#c2410c',
  accent: '#f97316',
  accentHover: '#ea580c',
  accentDim: 'rgba(249, 115, 22, 0.15)',
  accentGlow: 'rgba(249, 115, 22, 0.25)',
  border: '#fed7aa',
  borderLight: '#ffedd5',
  success: '#22c55e',
  warning: '#d97706',
  error: '#ef4444',
  info: '#3b82f6',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.15)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 极光紫
// #f3e8ff 浅背景, #c084fc 中间色, #8b5cf6 主色, #6d28d9 深色
// #e0e7ff 辅助浅色, #4f46e5 辅助色
// ============================================
const AURORA_THEME: ColorScheme = {
  name: '极光紫',
  key: 'aurora',
  bgPrimary: '#faf5ff',
  bgSecondary: '#f3e8ff',
  bgCard: '#ffffff',
  bgElevated: '#faf5ff',
  bgHover: '#e9d5ff',
  bgModal: '#ffffff',
  textPrimary: '#3b0764',
  textSecondary: '#581c87',
  textMuted: '#7c3aed',
  accent: '#8b5cf6',
  accentHover: '#7c3aed',
  accentDim: 'rgba(139, 92, 246, 0.15)',
  accentGlow: 'rgba(139, 92, 246, 0.25)',
  border: '#e9d5ff',
  borderLight: '#f3e8ff',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#4f46e5',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.12)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 冰川蓝
// #e0f2fe 浅背景, #7dd3fc 中间色, #0ea5e9 主色, #0369a1 深色
// #f1f5f9 辅助浅色, #475569 辅助色
// ============================================
const GLACIER_THEME: ColorScheme = {
  name: '冰川蓝',
  key: 'glacier',
  bgPrimary: '#f0f9ff',
  bgSecondary: '#e0f2fe',
  bgCard: '#ffffff',
  bgElevated: '#f0f9ff',
  bgHover: '#bae6fd',
  bgModal: '#ffffff',
  textPrimary: '#0c4a6e',
  textSecondary: '#0369a1',
  textMuted: '#475569',
  accent: '#0ea5e9',
  accentHover: '#0284c7',
  accentDim: 'rgba(14, 165, 233, 0.15)',
  accentGlow: 'rgba(14, 165, 233, 0.25)',
  border: '#bae6fd',
  borderLight: '#e0f2fe',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0ea5e9',
  mediaComic: '#f97316',
  mediaComicDim: 'rgba(249, 115, 22, 0.12)',
  mediaAudio: '#0ea5e9',
  mediaAudioDim: 'rgba(14, 165, 233, 0.15)',
  mediaVideo: '#ec4899',
  mediaVideoDim: 'rgba(236, 72, 153, 0.12)',
};

// ============================================
// 所有预设主题
// ============================================
export const PRESET_SCHEMES: ColorScheme[] = [
  LIGHT_THEME,
  EYECARE_THEME,
  AMBER_DARK_THEME,
  AMBER_LIGHT_THEME,
  ROSE_LIGHT_THEME,
  CORAL_THEME,
  FOREST_THEME,
  SUNSET_THEME,
  AURORA_THEME,
  GLACIER_THEME,
];

export type ColorSchemeKey = string;

function applyThemeToCSS(scheme: ColorScheme) {
  const root = document.documentElement;
  
  root.style.setProperty('--bg-primary', scheme.bgPrimary);
  root.style.setProperty('--bg-secondary', scheme.bgSecondary);
  root.style.setProperty('--bg-card', scheme.bgCard);
  root.style.setProperty('--bg-elevated', scheme.bgElevated);
  root.style.setProperty('--bg-hover', scheme.bgHover);
  root.style.setProperty('--bg-modal', scheme.bgModal);
  root.style.setProperty('--text-primary', scheme.textPrimary);
  root.style.setProperty('--text-secondary', scheme.textSecondary);
  root.style.setProperty('--text-muted', scheme.textMuted);
  root.style.setProperty('--accent', scheme.accent);
  root.style.setProperty('--accent-hover', scheme.accentHover);
  root.style.setProperty('--accent-dim', scheme.accentDim);
  root.style.setProperty('--accent-glow', scheme.accentGlow);
  root.style.setProperty('--border', scheme.border);
  root.style.setProperty('--border-light', scheme.borderLight);
  root.style.setProperty('--success', scheme.success);
  root.style.setProperty('--warning', scheme.warning);
  root.style.setProperty('--error', scheme.error);
  root.style.setProperty('--info', scheme.info);
  root.style.setProperty('--media-comic', scheme.mediaComic);
  root.style.setProperty('--media-comic-dim', scheme.mediaComicDim);
  root.style.setProperty('--media-audio', scheme.mediaAudio);
  root.style.setProperty('--media-audio-dim', scheme.mediaAudioDim);
  root.style.setProperty('--media-video', scheme.mediaVideo);
  root.style.setProperty('--media-video-dim', scheme.mediaVideoDim);
  
  root.setAttribute('data-theme', scheme.key);
}

let cachedBgPath: string | null = null;
let cachedBgBase64: string | null = null;

export async function applyBackgroundSettings(
  bgPath: string | null,
  bgMode: 'full' | 'library',
  blurLevel: number,
  coverTransparent: boolean
) {
  const root = document.documentElement;

  if (bgPath) {
    if (bgPath !== cachedBgPath || !cachedBgBase64) {
      try {
        const { readImageAsBase64Resized } = await import('../api/media');
        cachedBgBase64 = await readImageAsBase64Resized(bgPath, 1920, 1080);
        cachedBgPath = bgPath;
      } catch {
        try {
          const { readImageAsBase64 } = await import('../api/media');
          cachedBgBase64 = await readImageAsBase64(bgPath);
          cachedBgPath = bgPath;
        } catch {
          cachedBgBase64 = null;
          cachedBgPath = null;
        }
      }
    }
    if (cachedBgBase64) {
      root.style.setProperty('--custom-bg-image', `url(${cachedBgBase64})`);
    } else {
      root.style.setProperty('--custom-bg-image', `url(file://${bgPath})`);
    }
  } else {
    root.style.setProperty('--custom-bg-image', 'none');
    cachedBgPath = null;
    cachedBgBase64 = null;
  }

  root.style.setProperty('--bg-mode', bgMode);

  if (bgPath) {
    root.style.setProperty('--bg-layer-opacity', bgMode === 'full' ? '1' : '0');
    root.style.setProperty('--library-bg-opacity', bgMode === 'library' ? '1' : '0');
  } else {
    root.style.setProperty('--bg-layer-opacity', '0');
    root.style.setProperty('--library-bg-opacity', '0');
  }

  const schemeKey = root.getAttribute('data-theme') || 'light';
  const scheme = PRESET_SCHEMES.find(s => s.key === schemeKey) || LIGHT_THEME;

  const makeSemiTransparent = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  if (bgPath) {
    const alpha = 1 - blurLevel * 0.009;
    const clampedAlpha = Math.max(0.08, Math.min(1, alpha));
    const coverAlpha = coverTransparent ? Math.max(0.04, clampedAlpha * 0.3) : 1;

    root.style.setProperty('--bg-primary', makeSemiTransparent(scheme.bgPrimary, clampedAlpha));
    root.style.setProperty('--bg-card', makeSemiTransparent(scheme.bgCard, clampedAlpha));
    root.style.setProperty('--bg-modal', makeSemiTransparent(scheme.bgModal, Math.min(1, clampedAlpha + 0.2)));
    root.style.setProperty('--bg-elevated', makeSemiTransparent(scheme.bgElevated, clampedAlpha));
    root.style.setProperty('--bg-hover', makeSemiTransparent(scheme.bgHover, clampedAlpha));
    root.style.setProperty('--cover-opacity', String(coverAlpha));

    if (bgMode === 'full') {
      root.style.setProperty('--bg-secondary', makeSemiTransparent(scheme.bgSecondary, clampedAlpha));
    } else {
      root.style.setProperty('--bg-secondary', scheme.bgSecondary);
    }
  } else {
    root.style.setProperty('--bg-primary', scheme.bgPrimary);
    root.style.setProperty('--bg-secondary', scheme.bgSecondary);
    root.style.setProperty('--bg-card', scheme.bgCard);
    root.style.setProperty('--bg-modal', scheme.bgModal);
    root.style.setProperty('--bg-elevated', scheme.bgElevated);
    root.style.setProperty('--bg-hover', scheme.bgHover);
    root.style.setProperty('--cover-opacity', '1');
  }
}

export function useTheme() {
  const [schemeKey, setSchemeKey] = useState<string>('light');

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await getSetting('color_scheme');
        if (saved && PRESET_SCHEMES.some(s => s.key === saved)) {
          setSchemeKey(saved);
          const scheme = PRESET_SCHEMES.find(s => s.key === saved)!;
          applyThemeToCSS(scheme);
        } else {
          applyThemeToCSS(LIGHT_THEME);
        }
      } catch {
        applyThemeToCSS(LIGHT_THEME);
      }
    };
    loadTheme();
  }, []);

  const applyTheme = useCallback(() => {
    const scheme = PRESET_SCHEMES.find(s => s.key === schemeKey) || LIGHT_THEME;
    applyThemeToCSS(scheme);
  }, [schemeKey]);

  const changeTheme = useCallback(async (newSchemeKey: string) => {
    const scheme = PRESET_SCHEMES.find(s => s.key === newSchemeKey);
    if (!scheme) return;
    
    setSchemeKey(newSchemeKey);
    applyThemeToCSS(scheme);
    
    try {
      const { setSetting } = await import('../api/settings');
      await setSetting('color_scheme', newSchemeKey);
    } catch (err) {
      console.error('Failed to save theme preference:', err);
    }

    try {
      const { getSetting } = await import('../api/settings');
      const [savedBg, savedBgMode, savedBlur, savedCoverTrans] = await Promise.all([
        getSetting('custom_bg'),
        getSetting('bg_mode'),
        getSetting('blur_level'),
        getSetting('cover_transparent'),
      ]);
      if (savedBg) {
        const coverTrans = savedCoverTrans === 'true';
        await applyBackgroundSettings(savedBg, (savedBgMode as 'full' | 'library') || 'full', savedBlur ? parseInt(savedBlur, 10) : 0, coverTrans);
      }
    } catch {
      // ignore
    }
  }, []);

  return {
    schemeKey,
    schemeName: PRESET_SCHEMES.find(s => s.key === schemeKey)?.name || '亮色',
    currentScheme: PRESET_SCHEMES.find(s => s.key === schemeKey) || LIGHT_THEME,
    schemes: PRESET_SCHEMES,
    applyTheme,
    changeTheme,
  };
}

export default useTheme;