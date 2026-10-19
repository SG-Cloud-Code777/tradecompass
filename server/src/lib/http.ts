export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public status?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}

export interface GetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  provider: string;
}

export async function httpGet(url: string, opts: GetOptions): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, { headers: opts.headers, signal: ctrl.signal });
    if (!res.ok) throw new ProviderError(opts.provider, `HTTP ${res.status} for ${redact(url)}`, res.status);
    return res;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(opts.provider, `request failed for ${redact(url)}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T = any>(url: string, opts: GetOptions): Promise<T> {
  return (await httpGet(url, opts)).json() as Promise<T>;
}

export async function getText(url: string, opts: GetOptions): Promise<string> {
  return (await httpGet(url, opts)).text();
}

/** Strip API keys from URLs before they reach logs or error messages. */
export function redact(url: string) {
  return url.replace(/(apikey|api_key|token|crumb)=[^&]+/gi, '$1=***');
}

/** Serialises calls so at most `perSecond` start each second (SEC asks for ≤ 10 req/s). */
export function rateLimiter(perSecond: number) {
  const gap = 1000 / perSecond;
  let next = 0;
  return async () => {
    const now = Date.now();
    const wait = Math.max(0, next - now);
    next = Math.max(now, next) + gap;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  };
}

/** Run async work over items with bounded concurrency; failures are returned, not thrown. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: ({ ok: true; value: R } | { ok: false; error: string })[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = { ok: true, value: await fn(items[idx]) };
        } catch (e) {
          out[idx] = { ok: false, error: (e as Error).message };
        }
      }
    }),
  );
  return out;
}
