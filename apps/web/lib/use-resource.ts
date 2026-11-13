'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

// Preserve the last successful response during refreshes and transient failures.
export function useResource<T>(path: string, parser: { parse: (input: unknown) => T }, interval = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const retryAfter = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const refresh = useCallback((): Promise<void> => {
    if (pending.current) return pending.current;
    const request = controller.current;
    if (!request || request.signal.aborted || Date.now() < retryAfter.current) return Promise.resolve();
    const work = (async () => {
      try {
        const result = parser.parse(await api(path, { signal: request.signal }));
        if (!request.signal.aborted) {
          setData(result);
          setError(null);
          retryAfter.current = 0;
        }
      } catch (failure) {
        if (!request.signal.aborted) {
          retryAfter.current =
            failure instanceof ApiError && failure.code === 'rate_limited'
              ? (failure.retryAt ?? Date.now() + 5000)
              : 0;
          setError(failure);
          throw failure;
        }
      } finally {
        if (!request.signal.aborted) setLoading(false);
        if (controller.current === request) pending.current = null;
      }
    })();
    pending.current = work;
    return work;
  }, [path, parser]);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    pending.current = null;
    const update = () => {
      void refresh().catch(() => {
        /* Displayed by the caller. */
      });
    };
    update();
    const timer = setInterval(update, interval);
    return () => {
      request.abort();
      clearInterval(timer);
    };
  }, [refresh, interval]);
  const refreshAfterWrite = useCallback(async () => {
    // A poll started before a mutation may contain the old state. Let it finish,
    // then perform a new read before unlocking the mutation's controls.
    await pending.current?.catch(() => {});
    await refresh();
  }, [refresh]);
  return { data, error, loading, refresh, refreshAfterWrite };
}
