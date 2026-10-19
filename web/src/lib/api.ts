import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.error ?? res.statusText, json?.detail);
  return json as T;
}

export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });

/** Fetch-on-mount hook with refresh; ignores responses from superseded requests. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(!!path);
  const seq = useRef(0);
  const load = useCallback(
    async (suffix = '') => {
      if (!path) return;
      const id = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const sep = path.includes('?') ? '&' : '?';
        const d = await api<T>(suffix ? `${path}${sep}${suffix}` : path);
        if (id === seq.current) setData(d);
      } catch (e) {
        if (id === seq.current) setError(e as Error);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    setData(null);
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}
