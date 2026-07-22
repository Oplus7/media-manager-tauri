import { getSetting } from './settings';

export interface RagSettings {
  rag_endpoint: string;
  rag_collection: string;
}

export async function getRagSettings(): Promise<RagSettings> {
  const [ep, col] = await Promise.all([
    getSetting('rag_endpoint'),
    getSetting('rag_collection'),
  ]);
  return {
    rag_endpoint: ep || 'http://localhost:8100',
    rag_collection: col || 'media_library',
  };
}

export interface RagIndexPayload {
  media_id: string;
  name: string;
  media_type: string;
  author?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  path?: string;
}

export async function ragIndexMedia(payload: RagIndexPayload): Promise<void> {
  const { rag_endpoint, rag_collection } = await getRagSettings();
  const res = await fetch(`${rag_endpoint}/api/media/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, collection: rag_collection }),
  });
  if (!res.ok) throw new Error(`RAG index failed: ${res.status}`);
}

export async function ragDeleteMedia(mediaId: string): Promise<void> {
  const { rag_endpoint, rag_collection } = await getRagSettings();
  const res = await fetch(`${rag_endpoint}/api/media/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId, collection: rag_collection }),
  });
  if (!res.ok) throw new Error(`RAG delete failed: ${res.status}`);
}
