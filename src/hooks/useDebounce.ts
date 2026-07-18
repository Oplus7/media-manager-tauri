import { useRef, useCallback } from 'react';

export function useDebounce<T extends (...args: never[]) => void>(
  callback: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(((...args: Parameters<T>) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }) as T, [delay]) as T;
}

export default useDebounce;
