import { useState, useEffect, useRef, useCallback } from 'react';
import { readImageAsBase64 } from '../api/media';

const MAX_CONCURRENT = 6;
const MAX_CACHE_SIZE = 150;

export function useCoverCache(items: { id: string; cover_path: string | null }[]) {
  const [cache, setCache] = useState<Record<string, string>>({});
  const pathMapRef = useRef<Record<string, string>>({});
  const accessOrderRef = useRef<string[]>([]);
  const loadingRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const pendingBatchRef = useRef<Record<string, string>>({});
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const evictOldest = useCallback((cache: Record<string, string>, keepIds: Set<string>) => {
    const keys = Object.keys(cache);
    if (keys.length <= MAX_CACHE_SIZE) return cache;

    const next = { ...cache };
    const order = accessOrderRef.current.filter(id => keys.includes(id) && !keepIds.has(id));
    const toEvict = order.slice(0, keys.length - MAX_CACHE_SIZE);
    for (const id of toEvict) {
      delete next[id];
      delete pathMapRef.current[id];
    }
    return next;
  }, []);

  const flushPending = useCallback(() => {
    const pending = pendingBatchRef.current;
    if (Object.keys(pending).length === 0) return;
    pendingBatchRef.current = {};

    const currentItemIds = new Set(items.map(i => i.id));
    setCache(prev => {
      const next = { ...prev, ...pending };
      return evictOldest(next, currentItemIds);
    });

    for (const id of Object.keys(pending)) {
      accessOrderRef.current = accessOrderRef.current.filter(x => x !== id);
      accessOrderRef.current.push(id);
    }
  }, [items, evictOldest]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushPending();
    }, 50);
  }, [flushPending]);

  const loadBatch = useCallback(async (paths: { id: string; path: string }[]) => {
    const queue = [...paths];
    const active: Promise<void>[] = [];

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        if (loadingRef.current.has(item.id)) continue;
        loadingRef.current.add(item.id);

        try {
          const base64 = await readImageAsBase64(item.path);
          if (mountedRef.current) {
            pendingBatchRef.current[item.id] = base64;
            pathMapRef.current[item.id] = item.path;
            scheduleFlush();
          }
        } catch {
          // ignore
        } finally {
          loadingRef.current.delete(item.id);
        }
      }
    };

    for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
      active.push(worker());
    }

    await Promise.all(active);
    flushPending();
  }, [scheduleFlush, flushPending]);

  useEffect(() => {
    const toLoad: { id: string; path: string }[] = [];
    const toInvalidate: string[] = [];

    for (const item of items) {
      if (!item.cover_path) continue;
      const cachedPath = pathMapRef.current[item.id];
      if (cachedPath && cachedPath !== item.cover_path) {
        toInvalidate.push(item.id);
      }
    }

    if (toInvalidate.length > 0) {
      setCache((prev) => {
        const next = { ...prev };
        for (const id of toInvalidate) {
          delete next[id];
        }
        return next;
      });
      for (const id of toInvalidate) {
        delete pathMapRef.current[id];
        accessOrderRef.current = accessOrderRef.current.filter(x => x !== id);
      }
    }

    for (const item of items) {
      if (item.cover_path && !pathMapRef.current[item.id] && !loadingRef.current.has(item.id)) {
        toLoad.push({ id: item.id, path: item.cover_path });
      }
    }
    if (toLoad.length > 0) {
      loadBatch(toLoad);
    }
  }, [items, loadBatch]);

  return cache;
}

export default useCoverCache;
