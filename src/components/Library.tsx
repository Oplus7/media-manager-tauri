import { useState, useRef, useMemo, useCallback, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLibrary } from '../hooks/useQueryHooks';
import { useCoverCache, useDebounce } from '../hooks';
import { getTagsWithCounts } from '../api/tags';
import type { MediaItem, Category, SubFilter, LibraryQuery, TagWithCount } from '../types';
import '../styles/library.css';

interface LibraryProps {
  onImportClick: () => void;
  onSettingsClick: () => void;
  onItemClick: (id: string) => void;
  onPlay: (item: MediaItem) => void;
  refreshTrigger: number;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200];
const PAGE_SIZE_DEFAULT = 50;
const CARD_BASE_WIDTH = 180;
const GAP_MIN = 8;
const OVERSCAN = 5;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP_BTN = 10;
const ZOOM_STEP_WHEEL = 5;

const CATEGORY_CONFIG = {
  all: { label: '全部', icon: '📚', color: 'default' },
  comic: { label: '漫画', icon: '📖', color: 'comic' },
  audio: { label: '音声', icon: '🎵', color: 'audio' },
  video: { label: '影视', icon: '🎬', color: 'video' },
} as const;

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'import_desc', label: '最近导入' },
  { value: 'import_asc', label: '最早导入' },
  { value: 'name_asc', label: '名称 A-Z' },
  { value: 'name_desc', label: '名称 Z-A' },
  { value: 'size_desc', label: '文件大小' },
] as const;

interface CardProps {
  item: MediaItem;
  coverUrl: string | undefined;
  onItemClick: (id: string) => void;
  onPlay: (item: MediaItem) => void;
}

const MemoizedCard = memo(function MemoizedCard({ item, coverUrl, onItemClick, onPlay }: CardProps) {
  const tags = item.tags?.slice(0, 5) || [];
  const extraTags = (item.tags?.length || 0) - 5;
  const mediaIcon = CATEGORY_CONFIG[item.media_type as keyof typeof CATEGORY_CONFIG]?.icon || '📄';

  return (
    <div className="item-card" onClick={() => onItemClick(item.id)}>
      <div className="item-cover">
        {coverUrl ? (
          <img src={coverUrl} alt={item.name} loading="lazy" />
        ) : (
          <div className="cover-placeholder">{mediaIcon}</div>
        )}

        <span className={`item-badge badge-type ${item.media_type}`}>
          {item.media_type === 'comic' ? '漫画' : item.media_type === 'audio' ? '音声' : '影视'}
        </span>
        <span className="item-badge badge-series">
          {item.is_series ? '系列' : '单作'}
        </span>

        <div className="item-play-overlay" onClick={(e) => { e.stopPropagation(); onPlay(item); }}>
          <div className="play-btn-large">▶</div>
        </div>
      </div>

      <div className="item-info">
        <h3 className="item-name" title={item.name}>{item.name}</h3>
        <div className="item-tags">
          {tags.map((tag, idx) => (
            <span key={idx} className="tag">{tag.name}</span>
          ))}
          {extraTags > 0 && (
            <span className="tag more">+{extraTags}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default function Library({
  onImportClick,
  onSettingsClick,
  onItemClick,
  onPlay,
  refreshTrigger,
}: LibraryProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [category, setCategory] = useState<Category>('all');
  const [subFilter, setSubFilter] = useState<SubFilter>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debouncedSetSearch = useDebounce((value: string) => {
    setDebouncedSearch(value);
    setPage(1);
  }, 300);
  const [sortBy, setSortBy] = useState<string>('updated_desc');
  const [jumpPage, setJumpPage] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [zoom, setZoom] = useState(100);

  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagMode, setTagMode] = useState<'and' | 'or'>('or');
  const [tagSearch, setTagSearch] = useState('');

  const parentRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const query: LibraryQuery = {
    category,
    sub_filter: subFilter,
    search: debouncedSearch || null,
    tag_ids: selectedTagIds.length > 0 ? selectedTagIds : null,
    tag_mode: tagMode,
    page,
    page_size: pageSize,
    sort_by: sortBy,
  };

  const { data: result, isLoading } = useLibrary(query, refreshTrigger >= 0, refreshTrigger);
  const items = result?.items ?? [];
  const total = result?.total ?? 0;
  const loading = isLoading && !result;

  const coverCache = useCoverCache(items);
  const totalPages = Math.ceil(total / pageSize) || 1;

  const cardWidth = Math.round(CARD_BASE_WIDTH * zoom / 100);
  const coverHeight = Math.round(cardWidth * 4 / 3);
  const ROW_GAP = 20;
  const rowHeight = coverHeight + 80 + ROW_GAP;

  const { columns, colGap } = useMemo(() => {
    if (containerWidth <= 0) return { columns: 4, colGap: 16 };
    const usableWidth = containerWidth - 34;
    let cols = 2;
    for (let c = 2; c <= 20; c++) {
      const totalCardsWidth = c * cardWidth;
      if (totalCardsWidth > usableWidth) break;
      const totalGap = usableWidth - totalCardsWidth;
      const gap = totalGap / (c - 1);
      if (gap < GAP_MIN) break;
      cols = c;
      if (totalGap >= cardWidth + GAP_MIN) continue;
      break;
    }
    const gap = (usableWidth - cols * cardWidth) / (cols - 1);
    return { columns: cols, colGap: Math.round(gap) };
  }, [containerWidth, cardWidth]);

  const rowCount = Math.ceil(items.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [zoom, columns, items]);

  useEffect(() => {
    loadTags();
  }, [refreshTrigger]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handleScroll = () => {
      setShowScrollTop(el.scrollTop > 300);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP_WHEEL : ZOOM_STEP_WHEEL;
        setZoom((prev) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev + delta)));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const loadTags = async () => {
    try {
      const tags = await getTagsWithCounts();
      setAllTags(tags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const scrollToTop = useCallback(() => {
    parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleZoomIn = () => setZoom((prev) => Math.min(ZOOM_MAX, prev + ZOOM_STEP_BTN));
  const handleZoomOut = () => setZoom((prev) => Math.max(ZOOM_MIN, prev - ZOOM_STEP_BTN));

  const handleCategoryChange = (newCategory: Category) => {
    setCategory(newCategory);
    setPage(1);
    if (newCategory !== 'audio' && newCategory !== 'video') {
      setSubFilter(null);
    }
  };

  const handleSubFilterChange = (filter: SubFilter) => {
    setSubFilter(filter);
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    debouncedSetSearch(value);
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  const handleTagToggle = (tagId: number) => {
    setSelectedTagIds((prev) => {
      const next = prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId];
      return next;
    });
    setPage(1);
  };

  const handleClearTags = () => {
    setSelectedTagIds([]);
    setPage(1);
  };

  const handleJump = () => {
    const targetPage = parseInt(jumpPage, 10);
    if (targetPage >= 1 && targetPage <= totalPages) {
      setPage(targetPage);
      setJumpPage('');
    }
  };

  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return allTags;
    const q = tagSearch.trim().toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, tagSearch]);

  const renderCard = (item: MediaItem) => (
    <MemoizedCard
      key={item.id}
      item={item}
      coverUrl={coverCache[item.id]}
      onItemClick={onItemClick}
      onPlay={onPlay}
    />
  );

  return (
    <div className="library">
      <header className="library-header">
        <div className="library-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <h1>Media Manager</h1>
        </div>

        <div className="header-search">
          <svg className="header-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="搜索作品名称、作者..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="header-actions">
          <button className="btn btn-primary" onClick={onImportClick}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            导入
          </button>
          <button className="btn btn-secondary" onClick={onSettingsClick}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            设置
          </button>
        </div>
      </header>

      <div className="library-toolbar">
        <div className="toolbar-left">
          <div className="category-tabs">
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                className={`category-tab ${category === key ? 'active' : ''} ${config.color !== 'default' ? config.color : ''}`}
                onClick={() => handleCategoryChange(key as Category)}
              >
                <span className="category-tab-icon">{config.icon}</span>
                <span>{config.label}</span>
              </button>
            ))}
          </div>

          {(category === 'audio' || category === 'video') && (
            <div className="sub-filter-group">
              <button
                className={`sub-filter-btn ${subFilter === null ? 'active' : ''}`}
                onClick={() => handleSubFilterChange(null)}
              >
                全部
              </button>
              <button
                className={`sub-filter-btn ${subFilter === 'series' ? 'active' : ''}`}
                onClick={() => handleSubFilterChange('series')}
              >
                系列
              </button>
              <button
                className={`sub-filter-btn ${subFilter === 'single' ? 'active' : ''}`}
                onClick={() => handleSubFilterChange('single')}
              >
                单作
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-right">
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value)}
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            className="page-size-select"
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>每页 {size} 项</option>
            ))}
          </select>
        </div>
      </div>

      <div className="library-main">
        <aside className="library-sidebar">
          <div className="sidebar-search-row">
            <input
              type="text"
              className="sidebar-tag-search"
              placeholder="搜索标签..."
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
            />
            <select
              className="tag-mode-select"
              value={tagMode}
              onChange={(e) => { setTagMode(e.target.value as 'and' | 'or'); setPage(1); }}
            >
              <option value="or">任一标签</option>
              <option value="and">同时拥有</option>
            </select>
          </div>

          <button
            className={`sidebar-clear-btn ${selectedTagIds.length === 0 ? 'disabled' : ''}`}
            onClick={handleClearTags}
            disabled={selectedTagIds.length === 0}
          >
            清除筛选{selectedTagIds.length > 0 ? ` (${selectedTagIds.length})` : ''}
          </button>

          <div className="sidebar-tag-list">
            {filteredTags.length === 0 ? (
              <div className="sidebar-tag-empty">暂无标签</div>
            ) : (
              filteredTags.map((tag) => (
                <button
                  key={tag.id}
                  className={`sidebar-tag-item ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}
                  onClick={() => handleTagToggle(tag.id)}
                >
                  <span className="sidebar-tag-name">{tag.name}</span>
                  <span className="sidebar-tag-count">{tag.count}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="library-content">
          <div className="library-content-bg" />
          <div className="library-content-inner">
          <div className="library-grid-header">
            <div className="grid-header-info">
              共 <span>{total}</span> 项 · 第 <span>{page}</span> / {totalPages} 页
            </div>

            <div className="grid-header-zoom">
              <button className="zoom-btn" onClick={handleZoomOut} disabled={zoom <= ZOOM_MIN} title="缩小">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <span className="zoom-value">{zoom}%</span>
              <button className="zoom-btn" onClick={handleZoomIn} disabled={zoom >= ZOOM_MAX} title="放大">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
            </div>

            <div className="grid-header-pagination">
              <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(1)} title="首页">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
                </svg>
              </button>
              <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)} title="上一页">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)} title="下一页">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              <button className="pagination-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)} title="末页">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
                </svg>
              </button>

              <div className="pagination-jump">
                跳至
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJump()}
                />
                页
                <button className="btn btn-sm btn-secondary" onClick={handleJump}>跳转</button>
              </div>
            </div>
          </div>

          <div className="library-grid-wrapper">
            <div className="library-grid" ref={parentRef}>
              {loading ? (
                <div className="loading">
                  <div className="loading-spinner"></div>
                  <span>加载中...</span>
                </div>
              ) : items.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📂</div>
                  <h3 className="empty-state-title">没有找到媒体文件</h3>
                  <p className="empty-state-description">尝试导入新的媒体文件，或调整筛选条件</p>
                  <button className="btn btn-primary" onClick={onImportClick}>导入媒体</button>
                </div>
              ) : (
                <div
                  className="items-grid"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: 'relative',
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const rowItems = items.slice(
                      virtualRow.index * columns,
                      virtualRow.index * columns + columns
                    );
                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          display: 'grid',
                          gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
                          gap: `${colGap}px`,
                          justifyContent: 'space-between',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {rowItems.map((item) => renderCard(item))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {showScrollTop && (
              <button className="scroll-top-btn" onClick={scrollToTop} title="回到顶部">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            )}
          </div>
          </div>
        </main>
      </div>
    </div>
  );
}
