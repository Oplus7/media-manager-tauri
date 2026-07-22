import { useState } from 'react';
import { getRagSettings } from '../api/rag';
import '../styles/modal.css';

export interface RagPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenDetail: (mediaId: string) => void;
}

interface RagSource {
  content: string;
  source_file: string;
  source_type: string;
  chunk_index: number;
  media_id: string;
  media_name: string;
}

export default function RagPanel({ open, onClose, onOpenDetail }: RagPanelProps) {
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<RagSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuery = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    try {
      const { rag_endpoint, rag_collection } = await getRagSettings();
      const res = await fetch(`${rag_endpoint}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, collection: rag_collection, top_k: 8 }),
      });
      if (!res.ok) {
        setError(`RAG 服务错误：${res.status}`);
        setSources([]);
        return;
      }
      const data = await res.json();
      setSources(data.sources || []);
    } catch {
      setError('无法连接到 RAG 服务');
      setSources([]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content rag-panel-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '640px',
            maxWidth: '92vw',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
        <div className="modal-header">
          <h2>知识库问答</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="rag-panel-body" style={{ padding: '16px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="rag-query-row" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <input
              type="text"
              className="rag-query-input"
              placeholder="输入问题，检索你的媒体库..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleQuery();
              }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleQuery} disabled={loading}>
              {loading ? '检索中...' : '检索'}
            </button>
          </div>

          {error && (
            <div style={{ color: 'var(--error)', marginTop: '12px', fontSize: '14px', flexShrink: 0 }}>{error}</div>
          )}

          <div
            className="rag-results"
            style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}
          >
            {sources.length === 0 && !loading && !error && (
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                还没有检索结果。输入问题后点击「检索」。
              </div>
            )}
            {sources.map((s, idx) => (
              <div
                key={idx}
                className="rag-source-card"
                style={{ background: 'var(--bg-hover)', borderRadius: 'var(--radius-md)', padding: '12px' }}
              >
                <div className="rag-source-content" style={{ fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                  {s.content}
                </div>
                <div
                  className="rag-source-meta"
                  style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {s.media_name || s.source_file}
                  </span>
                  {s.media_id && (
                     <button
                       className="btn btn-sm"
                       onClick={() => onOpenDetail(s.media_id)}
                       style={{
                         color: '#fff',
                         background: 'var(--accent)',
                         border: 'none',
                         fontWeight: 600,
                         padding: '4px 14px',
                         fontSize: '12px',
                       }}
                     >
                       → 来源
                     </button>
                   )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
