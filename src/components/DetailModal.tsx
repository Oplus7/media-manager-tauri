import { useState, useEffect, useRef, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { getItemDetail, updateItem, getItemTags, addTagToItem, removeTagFromItem, readImageAsBase64, searchTags, extractVideoThumbnail } from '../api';
import { useDeleteItem } from '../hooks/useQueryHooks';
import { ragIndexMedia, ragDeleteMedia } from '../api/rag';
import { useDebounce } from '../hooks';
import type { MediaItem, Tag } from '../types';
import '../styles/modal.css';

interface DetailModalProps {
  itemId: string | null;
  open: boolean;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
  onDeleted: () => void;
  onTagsChanged: () => void;
  onUpdated: () => void;
}

// 媒体类型显示配置
const MEDIA_TYPE_CONFIG = {
  comic: { label: '漫画', class: 'comic' },
  audio: { label: '音声', class: 'audio' },
  video: { label: '影视', class: 'video' },
} as const;

export default function DetailModal({
  itemId,
  open,
  onClose,
  onPlay,
  onDeleted,
  onTagsChanged,
  onUpdated,
}: DetailModalProps) {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [editName, setEditName] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMediaType, setEditMediaType] = useState<string>('comic');
  
  const [loading, setLoading] = useState(false);
  const [ragBusy, setRagBusy] = useState(false);
  const [ragMsg, setRagMsg] = useState<string | null>(null);
  const ragMsgColor = ragMsg && (ragMsg.includes('失败') || ragMsg.includes('无法连接')) ? 'var(--error)' : 'var(--success)';
  const deleteMutation = useDeleteItem();

  const tagInputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (open && itemId) {
      loadItem();
    } else if (!open) {
      setEditMode(false);
    }
  }, [open, itemId]);

  const loadItem = async () => {
    if (!itemId) return;
    setLoading(true);
    console.log('[DetailModal] 开始加载项目:', itemId);
    try {
      const [detail, itemTags] = await Promise.all([
        getItemDetail(itemId),
        getItemTags(itemId),
      ]);
      if (detail) {
        console.log('[DetailModal] 项目数据已加载, cover_path:', detail.cover_path);
        setItem(detail);
        setEditName(detail.name);
        setEditAuthor(detail.author || '');
        setEditDescription(detail.description || '');
        setEditMediaType(detail.media_type);
        
        if (detail.cover_path) {
          console.log('[DetailModal] 正在加载封面图片:', detail.cover_path);
          try {
            const base64 = await readImageAsBase64(detail.cover_path);
            console.log('[DetailModal] 封面已加载, base64长度:', base64.length);
            setCoverUrl(base64);
          } catch (err) {
            console.error('[DetailModal] 封面加载失败:', err);
            setCoverUrl(null);
          }
        } else {
          console.log('[DetailModal] 项目无封面路径');
          setCoverUrl(null);
        }
      } else {
        console.log('[DetailModal] 项目详情为空');
      }
      setTags(itemTags);
    } catch (err) {
      console.error('[DetailModal] 加载项目失败:', err);
    }
    setLoading(false);
  };

  const loadTags = async () => {
    if (!itemId) return;
    try {
      const itemTags = await getItemTags(itemId);
      setTags(itemTags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const handleSave = async () => {
    if (!item) return;
    setLoading(true);
    try {
      await updateItem({
        ...item,
        name: editName,
        author: editAuthor || null,
        description: editDescription || null,
        media_type: editMediaType,
      });
      setEditMode(false);
      onUpdated();
      try {
        await ragIndexMedia({
          media_id: item.id,
          name: item.name,
          media_type: item.media_type,
          author: item.author || '',
          description: item.description || '',
          tags: item.tags?.map((t) => t.name) || [],
          path: item.path,
        });
      } catch {
        // RAG unreachable: non-blocking
      }
      loadItem();
    } catch (err) {
      console.error('Failed to update item:', err);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!item) return;
    if (!confirm(`确定要删除 "${item.name}" 吗？此操作不可撤销。`)) return;
    setLoading(true);
    try {
      await deleteMutation.mutateAsync(item.id);
      try {
        await ragDeleteMedia(item.id);
      } catch {
        // RAG unreachable: non-blocking, the delete succeeded
      }
      onDeleted();
      onClose();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
    setLoading(false);
  };

  const handleIndexToRag = async () => {
    if (!item) return;
    setRagBusy(true);
    setRagMsg(null);
    try {
      await ragIndexMedia({
        media_id: item.id,
        name: item.name,
        media_type: item.media_type,
        author: item.author || '',
        description: item.description || '',
        tags: item.tags?.map((t) => t.name) || [],
        path: item.path,
      });
      setRagMsg('已索引入知识库');
    } catch {
      setRagMsg('索引入知识库失败，请检查 RAG 服务连接');
    } finally {
      setRagBusy(false);
    }
  };

  const handleAddTag = async (tagName?: string) => {
    const nameToAdd = tagName || tagInput.trim();
    if (!item || !nameToAdd) return;
    const existingTagNames = tags.map((t) => t.name.toLowerCase());
    if (existingTagNames.includes(nameToAdd.toLowerCase())) {
      setTagInput('');
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      tagInputRef.current?.focus();
      return;
    }
    try {
      await addTagToItem(item.id, nameToAdd);
      setTagInput('');
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      onTagsChanged();
      await loadTags();
      tagInputRef.current?.focus();
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    if (!item) return;
    try {
      await removeTagFromItem(item.id, tagId);
      onTagsChanged();
      loadTags();
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleOpenFolder = async () => {
    if (!item) return;
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      const folderPath = item.path.replace(/[/\\][^/\\]*$/, '');
      await openPath(folderPath);
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  const [coverLoading, setCoverLoading] = useState(false);

  const handleChangeCover = async () => {
    if (!item) return;
    try {
      const folderPath = item.path.replace(/[/\\][^/\\]*$/, '');
      const selected = await openDialog({
        title: '选择封面',
        defaultPath: folderPath,
        filters: [
          { name: '图片和视频', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'] },
          { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
          { name: '视频', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'] },
        ],
        multiple: false,
      });
      if (!selected) return;
      
      const path = typeof selected === 'string' ? selected : Array.isArray(selected) ? selected[0] : null;
      if (!path) return;

      const ext = path.split('.').pop()?.toLowerCase() || '';
      const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'];

      if (videoExts.includes(ext)) {
        setCoverLoading(true);
        console.log('[封面] 选择视频文件提取封面:', path);
        try {
          const thumbPath = await extractVideoThumbnail(path);
          console.log('[封面] 视频缩略图提取结果:', thumbPath);
          if (thumbPath) {
            console.log('[封面] 正在更新项目封面路径:', thumbPath);
            const currentItem = await getItemDetail(item.id);
            if (currentItem) {
              await updateItem({ ...currentItem, cover_path: thumbPath });
              console.log('[封面] 项目封面已更新');
            } else {
              console.log('[封面] 错误: 无法获取当前项目详情');
            }
          } else {
            console.log('[封面] 错误: 缩略图提取失败，返回值为null');
            alert('视频封面提取失败，请确保已安装FFmpeg');
          }
        } catch (err) {
          console.error('[封面] 提取视频缩略图时出错:', err);
          alert('提取视频封面时出错: ' + (err instanceof Error ? err.message : String(err)));
        }
        setCoverLoading(false);
      } else {
        console.log('[封面] 选择图片文件作为封面:', path);
        await updateItem({ ...item, cover_path: path });
        console.log('[封面] 图片封面已更新');
      }
      onUpdated();
      // 确保状态更新后再重新加载
      setCoverUrl(null); // 先清除当前封面
      await loadItem(); // 重新加载项目
      console.log('[封面] loadItem完成，当前cover_path:', item.cover_path);
    } catch (err) {
      console.error('Failed to select cover:', err);
      setCoverLoading(false);
    }
  };

  const doSearchTags = useCallback(async (value: string) => {
    if (value.trim().length >= 1) {
      try {
        const results = await searchTags(value.trim());
        const existingNames = tags.map((t) => t.name.toLowerCase());
        const filtered = results.filter((t) => !existingNames.includes(t.name.toLowerCase()));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [tags]);

  const debouncedSearchTags = useDebounce(doSearchTags, 300);

  const handleTagInputChange = useCallback((value: string) => {
    setTagInput(value);
    setSelectedSuggestionIndex(-1);
    debouncedSearchTags(value);
  }, [debouncedSearchTags]);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        handleAddTag(suggestions[selectedSuggestionIndex].name);
      } else {
        handleAddTag();
      }
    } else if (e.key === 'Tab') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        const nextIndex = e.shiftKey
          ? (selectedSuggestionIndex <= 0 ? suggestions.length - 1 : selectedSuggestionIndex - 1)
          : (selectedSuggestionIndex >= suggestions.length - 1 ? 0 : selectedSuggestionIndex + 1);
        setSelectedSuggestionIndex(nextIndex);
      }
    } else if (e.key === 'ArrowDown') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        const nextIndex = selectedSuggestionIndex >= suggestions.length - 1 ? 0 : selectedSuggestionIndex + 1;
        setSelectedSuggestionIndex(nextIndex);
      }
    } else if (e.key === 'ArrowUp') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        const prevIndex = selectedSuggestionIndex <= 0 ? suggestions.length - 1 : selectedSuggestionIndex - 1;
        setSelectedSuggestionIndex(prevIndex);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleSuggestionClick = (tagName: string) => {
    handleAddTag(tagName);
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 - 最高优先级 */}
        <div className="modal-header">
          <h2>{editMode ? '编辑信息' : '详情'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* 主内容区 - 中等优先级（封面固定，信息可滚动） */}
        <div className="detail-body">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <span>加载中...</span>
            </div>
          ) : item ? (
            <>
              {/* 左侧封面区域 - 固定不变 */}
              <div className="detail-cover-section">
                <div className="detail-cover-wrapper">
                  {coverUrl ? (
                    <img src={coverUrl} alt={item.name} />
                  ) : (
                    <div className="detail-cover-placeholder">
                      {item.media_type === 'comic' ? '📖' :
                       item.media_type === 'audio' ? '🎵' : '🎬'}
                    </div>
                  )}

                  {/* 分类角标 */}
                  <div className="detail-cover-tag-primary">
                    <span className={`category-tag ${item.media_type}`}>
                      {MEDIA_TYPE_CONFIG[item.media_type as keyof typeof MEDIA_TYPE_CONFIG]?.label || item.media_type}
                    </span>
                  </div>
                  <div className="detail-cover-tag-secondary">
                    <span className="category-tag series">
                      {item.is_series ? '系列' : '单作'}
                    </span>
                  </div>

                  <button className="change-cover-btn" onClick={handleChangeCover} disabled={coverLoading}>
                    {coverLoading ? '提取中...' : '选择封面'}
                  </button>
                </div>

                {/* 编辑模式下的分类选择 */}
                {editMode && (
                  <div className="detail-media-type-edit">
                    <select
                      className="media-type-select"
                      value={editMediaType}
                      onChange={(e) => setEditMediaType(e.target.value)}
                    >
                      <option value="comic">漫画</option>
                      <option value="audio">音声</option>
                      <option value="video">影视</option>
                    </select>
                  </div>
                )}
              </div>

              {/* 右侧可滚动信息区域 - 最低优先级 */}
              <div className="detail-info-section">
                <div className="detail-info-scroll">
                  {/* 标题 */}
                  {editMode ? (
                    <input
                      type="text"
                      className="detail-title-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="作品名称"
                    />
                  ) : (
                    <h1 className="detail-title">{item.name}</h1>
                  )}

                  {/* 作者 */}
                  <div className="detail-meta">
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">作者：</span>
                      {editMode ? (
                        <input
                          type="text"
                          className="detail-author-input"
                          value={editAuthor}
                          onChange={(e) => setEditAuthor(e.target.value)}
                          placeholder="未知"
                        />
                      ) : (
                        <span className="detail-meta-value">{item.author || '未知'}</span>
                      )}
                    </div>
                  </div>

                  {/* 路径 */}
                  <div className="detail-path-inline">
                    <span className="detail-path-label">路径：</span>
                    <span className="detail-path-value">{item.path}</span>
                  </div>

                  {/* 标签 */}
                  <div className="detail-tags">
                    <div className="detail-tags-header">
                      <span className="detail-tags-title">标签</span>
                    </div>
                    <div className="detail-tags-list">
                      {tags.map((tag) => (
                        <span key={tag.id} className="detail-tag">
                          {tag.name}
                          {editMode && (
                            <button
                              className="detail-tag-remove"
                              onClick={() => handleRemoveTag(tag.id)}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {editMode && (
                      <div className="tag-add-section">
                        <div className="tag-add-input-wrapper">
                          <input
                            ref={tagInputRef}
                            type="text"
                            className="tag-add-input"
                            placeholder="输入标签，回车添加，支持搜索已有标签"
                            value={tagInput}
                            onChange={(e) => handleTagInputChange(e.target.value)}
                            onKeyDown={handleTagKeyDown}
                            onFocus={() => {
                              if (suggestions.length > 0) setShowSuggestions(true);
                            }}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                          />
                          {showSuggestions && suggestions.length > 0 && (
                            <div className="tag-suggestions-dropdown">
                              {suggestions.map((tag, index) => (
                                <div
                                  key={tag.id}
                                  ref={(el) => { suggestionRefs.current[index] = el; }}
                                  className={`tag-suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSuggestionClick(tag.name);
                                  }}
                                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                                >
                                  {tag.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleAddTag()}>
                          添加
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 简介 */}
                  <div className="detail-description">
                    <div className="detail-description-label">简介</div>
                    {editMode ? (
                      <textarea
                        className="detail-description-input"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="添加简介..."
                        rows={4}
                      />
                    ) : (
                      <div className="detail-description-text">
                        {item.description || '暂无简介'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">📄</div>
              <h3 className="empty-state-title">未找到项目</h3>
            </div>
          )}
        </div>

        {/* 底部操作栏 - 最高优先级，固定不变 */}
        {item && (
          <div className="detail-actions-bar">
            <button
              className="action-btn action-btn-primary"
              onClick={() => item && onPlay(item)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              播放
            </button>
            <button
              className="action-btn action-btn-secondary"
              onClick={() => setEditMode(!editMode)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {editMode ? '取消' : '编辑'}
            </button>
            <button
              className="action-btn action-btn-secondary"
              onClick={handleIndexToRag}
              disabled={ragBusy}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="4 4 20 12 4 20 4 4" />
              </svg>
               {ragBusy ? '索引中...' : '加入知识库'}
            </button>
            <button className="action-btn action-btn-secondary" onClick={handleOpenFolder}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              打开文件
            </button>
            {editMode && (
              <button
                className="action-btn action-btn-primary"
                onClick={handleSave}
                disabled={loading}
              >
                保存
              </button>
            )}
            <button
              className="action-btn action-btn-danger"
              onClick={handleDelete}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              删除
            </button>
          </div>
        )}
        {ragMsg && (
          <div style={{ color: ragMsgColor, marginTop: '8px', fontSize: '13px' }}>
            {ragMsg}
          </div>
        )}
      </div>
    </div>
  );
}