import { useState, useEffect, useRef, useCallback } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { importPaths, readImageAsBase64, extractVideoThumbnail } from '../api/media';
import { ragIndexMedia } from '../api/rag';
import { searchTags } from '../api/tags';
import { useConfirmImport } from '../hooks/useQueryHooks';
import { useDebounce } from '../hooks';
import type { ImportCandidate, Tag } from '../types';
import '../styles/modal.css';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  initialPaths: string[];
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  comic: '漫画',
  audio: '音声',
  video: '影视',
};

export default function ImportDialog({
  open,
  onClose,
  onImported,
  initialPaths,
}: ImportDialogProps) {
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [coverPreviews, setCoverPreviews] = useState<Record<number, string>>({});
  const [customCovers, setCustomCovers] = useState<Record<number, string | null>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [authorInput, setAuthorInput] = useState<Record<number, string>>({});
  const [descriptionInput, setDescriptionInput] = useState<Record<number, string>>({});
  const [itemTags, setItemTags] = useState<Record<number, Tag[]>>({});
  const [tagInput, setTagInput] = useState<Record<number, string>>({});

  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const suggestionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const confirmImportMutation = useConfirmImport();

  useEffect(() => {
    if (open && initialPaths.length > 0) {
      loadCandidates();
      setCurrentIndex(0);
    }
  }, [open, initialPaths]);

  useEffect(() => {
    const loadCovers = async () => {
      const previews: Record<number, string> = {};
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const coverPath = customCovers[i] ?? candidate.cover_path;
        if (coverPath) {
          try {
            const base64 = await readImageAsBase64(coverPath);
            previews[i] = base64;
          } catch {
            previews[i] = '';
          }
        } else {
          previews[i] = '';
        }
      }
      setCoverPreviews(previews);
    };
    if (candidates.length > 0) {
      loadCovers();
    }
  }, [candidates, customCovers]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const results = await importPaths(initialPaths);
      setCandidates(results);
      const initialCustomCovers: Record<number, string | null> = {};
      const initialAuthorInput: Record<number, string> = {};
      const initialDescriptionInput: Record<number, string> = {};
      const initialTagInput: Record<number, string> = {};
      const initialItemTags: Record<number, Tag[]> = {};
      results.forEach((c, i) => {
        initialCustomCovers[i] = null;
        initialAuthorInput[i] = c.author || '';
        initialDescriptionInput[i] = c.description || '';
        initialTagInput[i] = '';
        initialItemTags[i] = [];
      });
      setCustomCovers(initialCustomCovers);
      setAuthorInput(initialAuthorInput);
      setDescriptionInput(initialDescriptionInput);
      setTagInput(initialTagInput);
      setItemTags(initialItemTags);
    } catch (err) {
      console.error('Failed to import paths:', err);
    }
    setLoading(false);
  };

  const [coverSelectIndex, setCoverSelectIndex] = useState<number | null>(null);

  const handleSelectCover = async (index: number) => {
    try {
      const candidate = candidates[index];
      const folderPath = candidate?.path?.replace(/[/\\][^/\\]*$/, '') || undefined;
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
        setCoverSelectIndex(index);
        try {
          const thumbPath = await extractVideoThumbnail(path);
          if (thumbPath) {
            setCustomCovers((prev) => ({ ...prev, [index]: thumbPath }));
          }
        } catch (err) {
          console.error('Failed to extract video thumbnail:', err);
        }
        setCoverSelectIndex(null);
      } else {
        setCustomCovers((prev) => ({ ...prev, [index]: path }));
      }
    } catch (err) {
      console.error('Failed to select cover:', err);
      setCoverSelectIndex(null);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const tags = itemTags[i]?.map((t) => t.name) || [];
        const coverToUse = customCovers[i] ?? candidate.cover_path;
        const candidateWithCustomCover = {
          ...candidate,
          cover_path: coverToUse,
          author: authorInput[i] || null,
          description: descriptionInput[i] || null,
        };
        const savedItem = await confirmImportMutation.mutateAsync({ candidate: candidateWithCustomCover, tagNames: tags });
        try {
          await ragIndexMedia({
            media_id: savedItem.id,
            name: savedItem.name,
            media_type: savedItem.media_type,
            author: savedItem.author || '',
            description: savedItem.description || '',
            tags: tags,
            path: savedItem.path,
          });
        } catch {
          // RAG unreachable: skip, non-blocking
        }
      }
      onImported();
      onClose();
    } catch (err) {
      console.error('Failed to confirm import:', err);
    }
    setLoading(false);
  };

  const handleAddTag = (index: number, tagName?: string) => {
    const nameToAdd = tagName || tagInput[index]?.trim();
    if (!nameToAdd) return;

    const currentTags = itemTags[index] || [];
    const existingNames = currentTags.map((t) => t.name.toLowerCase());
    if (existingNames.includes(nameToAdd.toLowerCase())) {
      setTagInput((prev) => ({ ...prev, [index]: '' }));
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      tagInputRef.current?.focus();
      return;
    }

    const newTag: Tag = { id: Date.now() + Math.random(), name: nameToAdd };
    setItemTags((prev) => ({
      ...prev,
      [index]: [...(prev[index] || []), newTag],
    }));
    setTagInput((prev) => ({ ...prev, [index]: '' }));
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    tagInputRef.current?.focus();
  };

  const handleRemoveTag = (index: number, tagId: number) => {
    setItemTags((prev) => ({
      ...prev,
      [index]: (prev[index] || []).filter((t) => t.id !== tagId),
    }));
  };

  const doSearchTags = useCallback(async (value: string, index: number) => {
    if (value.trim().length >= 1) {
      try {
        const results = await searchTags(value.trim());
        const currentTags = itemTags[index] || [];
        const existingNames = currentTags.map((t) => t.name.toLowerCase());
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
  }, [itemTags]);

  const debouncedSearchTags = useDebounce(doSearchTags, 300);

  const handleTagInputChange = useCallback((index: number, value: string) => {
    setTagInput((prev) => ({ ...prev, [index]: value }));
    setSelectedSuggestionIndex(-1);
    debouncedSearchTags(value, index);
  }, [debouncedSearchTags]);

  const handleTagKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        handleAddTag(index, suggestions[selectedSuggestionIndex].name);
      } else {
        handleAddTag(index);
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

  if (!open) return null;

  const candidate = candidates[currentIndex];
  const coverUrl = coverPreviews[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < candidates.length - 1;
  const currentTags = itemTags[currentIndex] || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>导入媒体</h2>
          <span className="import-counter">
            {candidates.length > 0 ? `${currentIndex + 1} / ${candidates.length}` : ''}
          </span>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="detail-body">
          {loading ? (
            <div className="loading">
              <div className="loading-spinner"></div>
              <span>处理中...</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <h3 className="empty-state-title">没有找到支持的媒体文件</h3>
            </div>
          ) : candidate ? (
            <>
              <div className="detail-cover-section">
                <div className="detail-cover-wrapper">
                  {coverUrl ? (
                    <img src={coverUrl} alt="cover" className="detail-cover-img" />
                  ) : (
                    <div className="detail-cover-placeholder">
                      {candidate.media_type === 'audio' ? '🎵' : candidate.media_type === 'video' ? '🎬' : '📖'}
                    </div>
                  )}

                  <div className="detail-cover-tag-primary">
                    <span className={`category-tag ${candidate.media_type}`}>
                      {MEDIA_TYPE_LABELS[candidate.media_type] || candidate.media_type}
                    </span>
                  </div>
                  <div className="detail-cover-tag-secondary">
                    <span className="category-tag series">
                      {candidate.is_series ? '系列' : '单作'}
                    </span>
                  </div>

                  <button
                    className="change-cover-btn"
                    onClick={() => handleSelectCover(currentIndex)}
                    disabled={coverSelectIndex === currentIndex}
                  >
                    {coverSelectIndex === currentIndex ? '提取中...' : '选择封面'}
                  </button>
                </div>
              </div>

              <div className="detail-info-section">
                <div className="detail-info-scroll">
                  <h1 className="detail-title">{candidate.name}</h1>

                  <div className="detail-meta">
                    <div className="detail-meta-item">
                      <span className="detail-meta-label">作者：</span>
                      <input
                        type="text"
                        className="detail-author-input"
                        value={authorInput[currentIndex] || ''}
                        onChange={(e) =>
                          setAuthorInput((prev) => ({ ...prev, [currentIndex]: e.target.value }))
                        }
                        placeholder="输入作者"
                      />
                    </div>
                  </div>

                  <div className="detail-tags import-tags-no-border">
                    <div className="detail-tags-header">
                      <span className="detail-tags-title">标签</span>
                    </div>
                    <div className="detail-tags-list">
                      {currentTags.map((tag) => (
                        <span key={tag.id} className="detail-tag">
                          {tag.name}
                          <button
                            className="detail-tag-remove"
                            onClick={() => handleRemoveTag(currentIndex, tag.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="tag-add-section">
                      <div className="tag-add-input-wrapper">
                        <input
                          ref={tagInputRef}
                          type="text"
                          className="tag-add-input"
                          placeholder="输入标签，回车添加，支持搜索已有标签"
                          value={tagInput[currentIndex] || ''}
                          onChange={(e) => handleTagInputChange(currentIndex, e.target.value)}
                          onKeyDown={(e) => handleTagKeyDown(currentIndex, e)}
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
                                  handleAddTag(currentIndex, tag.name);
                                }}
                                onMouseEnter={() => setSelectedSuggestionIndex(index)}
                              >
                                {tag.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleAddTag(currentIndex)}>
                        添加
                      </button>
                    </div>
                  </div>

                  <div className="detail-description">
                    <div className="detail-description-label">简介</div>
                    <textarea
                      className="detail-description-input"
                      value={descriptionInput[currentIndex] || ''}
                      onChange={(e) =>
                        setDescriptionInput((prev) => ({ ...prev, [currentIndex]: e.target.value }))
                      }
                      placeholder="添加简介..."
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="detail-actions-bar">
          <button
            className="action-btn action-btn-secondary"
            disabled={!hasPrev}
            onClick={() => setCurrentIndex(currentIndex - 1)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            上一个
          </button>
          <button
            className="action-btn action-btn-secondary"
            disabled={!hasNext}
            onClick={() => setCurrentIndex(currentIndex + 1)}
          >
            下一个
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <div style={{ flex: 1 }} />
          <button className="action-btn action-btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="action-btn action-btn-primary"
            onClick={handleConfirm}
            disabled={loading || candidates.length === 0}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            确认导入 ({candidates.length})
          </button>
        </div>
      </div>
    </div>
  );
}
