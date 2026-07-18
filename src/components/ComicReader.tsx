import { useState, useEffect, useCallback, useRef } from 'react';
import { listDirectoryFiles, readImageAsBase64 } from '../api';
import type { MediaItem } from '../types';
import '../styles/player.css';

interface ComicReaderProps {
  item: MediaItem | null;
  onClose: () => void;
}

const PRELOAD_RANGE = 3;

export default function ComicReader({ item, onClose }: ComicReaderProps) {
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [barsVisible, setBarsVisible] = useState(true);
  const [imageCache, setImageCache] = useState<Record<number, string>>({});
  const [jumpPage, setJumpPage] = useState('');
  const loadingRef = useRef<Set<number>>(new Set());
  const abortRef = useRef(false);
  const imagePathsRef = useRef<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (item) {
      loadImagePaths();
    }
    return () => {
      abortRef.current = true;
      setImagePaths([]);
      setImageCache({});
      loadingRef.current.clear();
      imagePathsRef.current = [];
    };
  }, [item]);

  const loadImagePaths = async () => {
    if (!item) return;
    setLoading(true);
    setError(null);
    abortRef.current = false;
    try {
      let files: string[] = [];
      if (item.is_series) {
        files = await listDirectoryFiles(item.path);
      } else {
        files = [item.path];
      }

      const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
      const filtered = files.filter((f) => {
        const ext = f.split('.').pop()?.toLowerCase() || '';
        return imageExts.includes(ext);
      }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (filtered.length === 0) {
        setError(`未找到图片文件 (共 ${files.length} 个文件)`);
      }

      imagePathsRef.current = filtered;
      setImagePaths(filtered);
      setCurrentIndex(0);
      setImageCache({});
      loadingRef.current.clear();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`加载图片失败: ${msg}`);
      console.error('Failed to load image paths:', err);
    }
    setLoading(false);
  };

  const preloadImage = useCallback(async (index: number) => {
    const paths = imagePathsRef.current;
    if (index < 0 || index >= paths.length) return;
    if (loadingRef.current.has(index)) return;
    if (imageCache[index]) return;

    loadingRef.current.add(index);

    try {
      const base64 = await readImageAsBase64(paths[index]);
      if (!abortRef.current) {
        setImageCache((prev) => ({ ...prev, [index]: base64 }));
      }
    } catch (err) {
      console.error(`Failed to load image ${index}:`, err);
    } finally {
      loadingRef.current.delete(index);
    }
  }, [imageCache]);

  useEffect(() => {
    for (let i = Math.max(0, currentIndex - PRELOAD_RANGE); i <= Math.min(imagePaths.length - 1, currentIndex + PRELOAD_RANGE); i++) {
      preloadImage(i);
    }
  }, [currentIndex, imagePaths.length, preloadImage]);

  const goNext = useCallback(() => {
    if (currentIndex < imagePaths.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, imagePaths.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleJump = () => {
    const page = parseInt(jumpPage, 10);
    if (page >= 1 && page <= imagePaths.length) {
      setCurrentIndex(page - 1);
      setJumpPage('');
    }
  };

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 2) {
      goPrev();
    } else {
      goNext();
    }
  }, [goPrev, goNext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'h' || e.key === 'H') {
        setBarsVisible(prev => !prev);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -10 : 10;
        setZoom(prev => Math.max(30, Math.min(500, prev + delta)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [goNext, goPrev, onClose]);

  if (!item) return null;

  const currentImage = imageCache[currentIndex];

  return (
    <div className="reader-overlay">
      {barsVisible && (
        <div className="reader-toolbar">
          <div className="toolbar-left">
            <button
              className="btn btn-ghost btn-icon-sm"
              onClick={() => setBarsVisible(false)}
              title="收起工具栏"
            >
              👁
            </button>
            <span className="item-name">{item.name}</span>
          </div>
          
          <div className="toolbar-center">
            <span className="zoom-display">{zoom}%</span>
            <button
              className="zoom-reset-btn"
              onClick={() => setZoom(100)}
              title="重置为100%"
            >
              1:1
            </button>
            
            <div className="jump-input">
              <span>跳转:</span>
              <input
                type="number"
                min="1"
                max={imagePaths.length}
                value={jumpPage}
                onChange={(e) => setJumpPage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJump()}
                placeholder={`1-${imagePaths.length}`}
              />
            </div>
          </div>
          
          <div className="toolbar-right">
            <button className="btn btn-secondary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      )}

      {!barsVisible && (
        <div className="reader-floating-bar">
          <button
            className="floating-btn"
            onClick={() => setBarsVisible(true)}
            title="展开工具栏"
          >
            ☰
          </button>
          <span className="floating-page-info">
            {currentIndex + 1} / {imagePaths.length}
          </span>
        </div>
      )}

      <div
        ref={contentRef}
        className="reader-content"
        onClick={handleContentClick}
      >
        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <span>加载中...</span>
          </div>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <h3 className="empty-state-title">加载失败</h3>
            <p className="empty-state-description">{error}</p>
            <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          </div>
        ) : imagePaths.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <h3 className="empty-state-title">没有找到图片</h3>
            <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          </div>
        ) : (
          <div className="image-container">
            {currentImage ? (
              <img
                src={currentImage}
                alt={`Page ${currentIndex + 1}`}
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center' }}
              />
            ) : (
              <div className="loading">
                <div className="loading-spinner"></div>
                <span>加载中...</span>
              </div>
            )}
          </div>
        )}

        {imagePaths.length > 1 && !loading && !error && (
          <div className="reader-page-hint">
            <div className={`page-hint-left ${currentIndex === 0 ? 'disabled' : ''}`}>
              ‹
            </div>
            <div className={`page-hint-right ${currentIndex === imagePaths.length - 1 ? 'disabled' : ''}`}>
              ›
            </div>
          </div>
        )}
      </div>

      {barsVisible && imagePaths.length > 1 && (
        <div className="reader-thumbnails">
          {imagePaths.map((_, idx) => (
            <div
              key={idx}
              className={`thumbnail ${idx === currentIndex ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
            >
              {imageCache[idx] ? (
                <img src={imageCache[idx]} alt={`Thumbnail ${idx + 1}`} />
              ) : (
                <span className="thumbnail-placeholder">{idx + 1}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
