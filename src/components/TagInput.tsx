import { useState, useEffect, useCallback } from 'react';
import { searchTags, checkSimilarTags } from '../api';
import { useDebounce } from '../hooks';
import type { Tag, TagSimilarityResult } from '../types';

interface TagInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [similarTags, setSimilarTags] = useState<TagSimilarityResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const loadSuggestions = useCallback(async (val: string) => {
    try {
      const [tags, similar] = await Promise.all([
        searchTags(val),
        checkSimilarTags(val),
      ]);
      setSuggestions(tags.filter((t) => !value.split(',').includes(t.name)));
      setSimilarTags(similar);
    } catch {
      // ignore
    }
  }, [value]);

  const debouncedLoad = useDebounce(loadSuggestions, 300);

  useEffect(() => {
    if (inputValue.length >= 1) {
      debouncedLoad(inputValue);
    } else {
      setSuggestions([]);
      setSimilarTags([]);
    }
  }, [inputValue, debouncedLoad]);

  const handleSelect = (tagName: string) => {
    const currentTags = value.split(',').map((t) => t.trim()).filter(Boolean);
    if (!currentTags.includes(tagName)) {
      currentTags.push(tagName);
      onChange(currentTags.join(', '));
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleRemove = (tagName: string) => {
    const currentTags = value.split(',').map((t) => t.trim()).filter(Boolean);
    const newTags = currentTags.filter((t) => t !== tagName);
    onChange(newTags.join(', '));
  };

  const currentTags = value.split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <div className="tag-input-container">
      <div className="selected-tags">
        {currentTags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button onClick={() => handleRemove(tag)}>×</button>
          </span>
        ))}
      </div>

      <div className="tag-input-wrapper">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder || '输入标签...'}
        />

        {showSuggestions && (suggestions.length > 0 || similarTags.length > 0) && (
          <div className="suggestions-dropdown">
            {suggestions.map((tag) => (
              <div key={tag.id} className="suggestion-item" onClick={() => handleSelect(tag.name)}>
                {tag.name}
              </div>
            ))}
            {similarTags.length > 0 && (
              <div className="similar-tags">
                <span className="similar-label">相似标签:</span>
                {similarTags.map((st) => (
                  <span
                    key={st.existing_tag}
                    className="similar-tag"
                    onClick={() => handleSelect(st.existing_tag)}
                  >
                    {st.existing_tag} ({Math.round(st.similarity * 100)}%)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
