import { useState, useEffect, useRef, useCallback } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { getSetting, setSetting } from '../api';
import { exportLibraryToFile, importLibraryFromFile } from '../api/library';
import { useTheme, applyBackgroundSettings } from '../hooks/useTheme';
import '../styles/modal.css';

type SettingsSection = 'appearance' | 'playback' | 'data' | 'about';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  onThemeChange: (schemeKey: string) => void;
}

export default function Settings({ open, onClose, onThemeChange }: SettingsProps) {
  const [colorScheme, setColorScheme] = useState('dark');
  const [playMode, setPlayMode] = useState<'builtin' | 'system'>('builtin');
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState<'full' | 'library'>('full');
  const [blurLevel, setBlurLevel] = useState(0);
  const [coverTransparent, setCoverTransparent] = useState(true);
  const [_saving, setSaving] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const { schemes } = useTheme();

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<SettingsSection, HTMLDivElement | null>>({
    appearance: null,
    playback: null,
    data: null,
    about: null,
  });

  // 加载设置
  useEffect(() => {
    if (open) {
      loadSettings();
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      const [savedScheme, savedPlayMode, savedBg, savedBgMode, savedBlur, savedCoverTrans] = await Promise.all([
        getSetting('color_scheme'),
        getSetting('play_mode'),
        getSetting('custom_bg'),
        getSetting('bg_mode'),
        getSetting('blur_level'),
        getSetting('cover_transparent'),
      ]);
      if (savedScheme) setColorScheme(savedScheme);
      if (savedPlayMode) setPlayMode(savedPlayMode as 'builtin' | 'system');
      if (savedBg) setCustomBg(savedBg);
      if (savedBgMode === 'full' || savedBgMode === 'library') setBgMode(savedBgMode);
      if (savedBlur) setBlurLevel(parseInt(savedBlur, 10));
      if (savedCoverTrans !== null) setCoverTransparent(savedCoverTrans !== 'false');
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  // 点击导航跳转
  const handleNavClick = useCallback((section: SettingsSection) => {
    setActiveSection(section);
    const ref = sectionRefs.current[section];
    if (ref && scrollRef.current) {
      // 计算目标位置
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const elementTop = ref.getBoundingClientRect().top;
      const scrollTop = scrollRef.current.scrollTop;
      const targetScroll = scrollTop + (elementTop - containerTop) - 20;
      
      scrollRef.current.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
    }
  }, []);

  // 滚动监听 - 更新左侧导航高亮
  useEffect(() => {
    if (!open) return;

    const container = scrollRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const containerRect = container.getBoundingClientRect();
        const containerTop = containerRect.top + 80;

        const sections: SettingsSection[] = ['appearance', 'playback', 'data', 'about'];
        let active: SettingsSection = 'appearance';
        let minDistance = Infinity;

        sections.forEach((section) => {
          const ref = sectionRefs.current[section];
          if (ref) {
            const rect = ref.getBoundingClientRect();
            const distance = Math.abs(rect.top - containerTop);
            if (rect.top <= containerTop && distance < minDistance) {
              minDistance = distance;
              active = section;
            }
          }
        });

        setActiveSection(active);
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [open]);

  const handleSchemeChange = async (schemeName: string) => {
    setSaving(true);
    try {
      setColorScheme(schemeName);
      onThemeChange(schemeName);
    } catch (err) {
      console.error('Failed to save color scheme:', err);
    }
    setSaving(false);
  };

  const handlePlayModeChange = async (mode: 'builtin' | 'system') => {
    setSaving(true);
    try {
      await setSetting('play_mode', mode);
      setPlayMode(mode);
    } catch (err) {
      console.error('Failed to save play mode:', err);
    }
    setSaving(false);
  };

  const handleSelectBackground = async () => {
    try {
      const selected = await openDialog({
        title: '选择背景图片',
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
        ],
        multiple: false,
      });
      if (selected) {
        const path = typeof selected === 'string' ? selected : selected[0];
        if (path) {
          setCustomBg(path);
          await setSetting('custom_bg', path);
          await applyBackgroundSettings(path, bgMode, blurLevel, coverTransparent);
        }
      }
    } catch (err) {
      console.error('Failed to select background:', err);
    }
  };

  const handleClearBackground = async () => {
    setCustomBg(null);
    await setSetting('custom_bg', '');
    await applyBackgroundSettings(null, bgMode, 0, coverTransparent);
    setBlurLevel(0);
    await setSetting('blur_level', '0');
  };

  const handleBgModeChange = async (mode: 'full' | 'library') => {
    setBgMode(mode);
    await setSetting('bg_mode', mode);
    await applyBackgroundSettings(customBg, mode, blurLevel, coverTransparent);
  };

  const handleBlurLevelChange = async (level: number) => {
    setBlurLevel(level);
    await applyBackgroundSettings(customBg, bgMode, level, coverTransparent);
  };

  const blurSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBlurLevelCommit = (level: number) => {
    if (blurSaveTimer.current) clearTimeout(blurSaveTimer.current);
    blurSaveTimer.current = setTimeout(async () => {
      await setSetting('blur_level', String(level));
    }, 500);
  };

  const handleCoverTransparentChange = async (checked: boolean) => {
    setCoverTransparent(checked);
    await setSetting('cover_transparent', String(checked));
    await applyBackgroundSettings(customBg, bgMode, blurLevel, checked);
  };

  const handleExportData = async () => {
    setDataMessage(null);
    try {
      const selected = await saveDialog({
        title: '导出媒体库数据',
        defaultPath: 'media-library-export.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!selected) return;
      const filePath = typeof selected === 'string' ? selected : selected[0];
      if (!filePath) return;
      const result = await exportLibraryToFile(filePath);
      setDataMessage(result);
    } catch (err) {
      console.error('Export failed:', err);
      setDataMessage(`导出失败：${err}`);
    }
  };

  const handleImportData = async () => {
    setDataMessage(null);
    try {
      const selected = await openDialog({
        title: '选择导入文件',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        multiple: false,
      });
      if (!selected) return;
      const filePath = typeof selected === 'string' ? selected : selected[0];
      if (!filePath) return;
      const result = await importLibraryFromFile(filePath);
      setDataMessage(result);
    } catch (err) {
      console.error('Import failed:', err);
      setDataMessage(`导入失败：${err}`);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="modal-header">
          <h2>设置</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* 设置内容区 */}
        <div className="settings-body">
          <div className="settings-layout">
            {/* 左侧导航 */}
            <nav className="settings-nav">
              <button
                className={`settings-nav-item ${activeSection === 'appearance' ? 'active' : ''}`}
                onClick={() => handleNavClick('appearance')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
                外观
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'playback' ? 'active' : ''}`}
                onClick={() => handleNavClick('playback')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                播放
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'data' ? 'active' : ''}`}
                onClick={() => handleNavClick('data')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                数据
              </button>
              <button
                className={`settings-nav-item ${activeSection === 'about' ? 'active' : ''}`}
                onClick={() => handleNavClick('about')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                关于
              </button>
            </nav>

            {/* 右侧内容 - 可滚动 */}
            <div className="settings-content" ref={scrollRef}>
              
              {/* 外观设置 */}
              <div 
                ref={(el) => { sectionRefs.current.appearance = el; }} 
                className="settings-panel"
              >
                <h3 className="settings-panel-title">外观设置</h3>

                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                    主题配色
                  </label>
                  <div className="theme-preview-grid">
                    {schemes.map((scheme) => (
                      <div
                        key={scheme.key}
                        className={`theme-preview-card ${colorScheme === scheme.key ? 'active' : ''}`}
                        onClick={() => handleSchemeChange(scheme.key)}
                      >
                        <div
                          className="theme-preview-swatch"
                          style={{
                            background: `linear-gradient(135deg, ${scheme.bgPrimary} 50%, ${scheme.bgCard} 50%)`,
                          }}
                        />
                        <div className="theme-preview-label">{scheme.name}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="custom-bg-section">
                  <label className="form-field-label">自定义背景</label>
                  <div
                    className="custom-bg-preview"
                    style={customBg ? { backgroundImage: `var(--custom-bg-image)` } : undefined}
                  >
                    {!customBg && (
                      <div className="custom-bg-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>上传图片作为背景</span>
                      </div>
                    )}
                  </div>
                  <div className="custom-bg-actions">
                    <button className="btn btn-secondary" onClick={handleSelectBackground}>
                      选择图片
                    </button>
                    {customBg && (
                      <button className="btn btn-ghost" onClick={handleClearBackground}>
                        使用默认
                      </button>
                    )}
                  </div>

                  {customBg && (
                    <>
                      <div className="bg-mode-section">
                        <label className="form-field-label">背景覆盖范围</label>
                        <div className="bg-mode-options">
                          <div
                            className={`play-mode-option ${bgMode === 'full' ? 'selected' : ''}`}
                            onClick={() => handleBgModeChange('full')}
                          >
                            <div className="play-mode-radio" />
                            <div className="play-mode-info">
                              <div className="play-mode-title">全窗口</div>
                              <div className="play-mode-desc">背景覆盖整个应用窗口</div>
                            </div>
                          </div>
                          <div
                            className={`play-mode-option ${bgMode === 'library' ? 'selected' : ''}`}
                            onClick={() => handleBgModeChange('library')}
                          >
                            <div className="play-mode-radio" />
                            <div className="play-mode-info">
                              <div className="play-mode-title">仅内容库</div>
                              <div className="play-mode-desc">背景仅覆盖内容库区域</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="blur-section">
                        <div className="blur-header">
                          <label className="form-field-label">组件虚化程度</label>
                          <span className="blur-value">{blurLevel}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={blurLevel}
                          onChange={(e) => handleBlurLevelChange(Number(e.target.value))}
                          onMouseUp={() => handleBlurLevelCommit(blurLevel)}
                          onTouchEnd={() => handleBlurLevelCommit(blurLevel)}
                        />
                        <div className="blur-labels">
                          <span>不透明</span>
                          <span>半透明</span>
                        </div>
                      </div>

                      <div className="cover-transparent-section">
                        <label className="cover-transparent-label">
                          <input
                            type="checkbox"
                            checked={coverTransparent}
                            onChange={(e) => handleCoverTransparentChange(e.target.checked)}
                          />
                          <span>封面使用透明效果</span>
                        </label>
                        <div className="cover-transparent-desc">
                          开启后卡片封面将应用当前透明度一半的效果
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 播放设置 */}
              <div 
                ref={(el) => { sectionRefs.current.playback = el; }} 
                className="settings-panel"
              >
                <h3 className="settings-panel-title">播放设置</h3>

                <div className="play-mode-options">
                  <div
                    className={`play-mode-option ${playMode === 'builtin' ? 'selected' : ''}`}
                    onClick={() => handlePlayModeChange('builtin')}
                  >
                    <div className="play-mode-radio" />
                    <div className="play-mode-info">
                      <div className="play-mode-title">内置播放器</div>
                      <div className="play-mode-desc">在应用内直接播放音频、视频和漫画</div>
                    </div>
                  </div>
                  <div
                    className={`play-mode-option ${playMode === 'system' ? 'selected' : ''}`}
                    onClick={() => handlePlayModeChange('system')}
                  >
                    <div className="play-mode-radio" />
                    <div className="play-mode-info">
                      <div className="play-mode-title">系统默认程序</div>
                      <div className="play-mode-desc">使用系统已安装的程序打开媒体文件</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 数据管理 */}
              <div 
                ref={(el) => { sectionRefs.current.data = el; }} 
                className="settings-panel"
              >
                <h3 className="settings-panel-title">数据管理</h3>

                {dataMessage && (
                  <div style={{
                    padding: '8px 12px',
                    marginBottom: '12px',
                    background: 'var(--bg-hover)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '14px',
                    color: dataMessage.includes('失败') ? 'var(--error)' : 'var(--success)',
                  }}>
                    {dataMessage}
                  </div>
                )}

                <div className="data-section">
                  <div className="data-section-title">导入数据</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>
                    从 JSON 文件导入媒体库数据
                  </p>
                  <button className="btn btn-secondary" onClick={handleImportData}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    选择文件
                  </button>
                </div>

                <div className="data-section">
                  <div className="data-section-title">导出数据</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>
                    将当前媒体库数据导出为 JSON 文件
                  </p>
                  <button className="btn btn-secondary" onClick={handleExportData}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    导出数据
                  </button>
                </div>
              </div>

              {/* 关于 */}
              <div 
                ref={(el) => { sectionRefs.current.about = el; }} 
                className="settings-panel"
              >
                <h3 className="settings-panel-title">关于</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>应用名称</div>
                    <div style={{ fontSize: '16px', fontWeight: '500' }}>Media Manager</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>版本</div>
                    <div style={{ fontSize: '16px' }}>0.2.3</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>技术栈</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      React 18 + TypeScript + Vite + Tauri 2.0
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>描述</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                      一款简洁高效的本地媒体文件管理应用，支持漫画、音声、影视等多种媒体类型的分类管理与播放。
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  );
}