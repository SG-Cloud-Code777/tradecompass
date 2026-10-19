import { one, q } from '../db/pool.js';

/** Every API payload carries provenance so the UI can show "last updated" and stale warnings. */
export interface Meta {
  source: string;
  fetchedAt: string;
  stale: boolean;
  /** Present when the latest refresh failed and we fell back to older cached data. */
  error?: string;
}

export interface Cached<T> {
  data: T;
  meta: Meta;
}

export class DataUnavailableError extends Error {
  statusCode = 503;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Read-through cache backed by the api_cache table.
 * - fresh hit  → cached data
 * - miss/old   → fetch; on success store it
 * - fetch fails → serve the old copy flagged stale with the error, or throw DataUnavailableError if none
 */
export async function cached<T>(
  key: string,
  ttlSec: number,
  fetcher: () => Promise<{ data: T; source: string }>,
  opts: { force?: boolean } = {},
): Promise<Cached<T>> {
  const row = await one<{ payload: T; source: string; fetched_at: Date }>(
    `select payload, source, fetched_at from api_cache where key = $1`,
    [key],
  );
  const age = row ? (Date.now() - new Date(row.fetched_at).getTime()) / 1000 : Infinity;
  if (row && age < ttlSec && !opts.force) {
    return { data: row.payload, meta: { source: row.source, fetchedAt: new Date(row.fetched_at).toISOString(), stale: false } };
  }
  try {
    const fresh = await fetcher();
    await q(
      `insert into api_cache (key, payload, source, fetched_at) values ($1, $2, $3, now())
       on conflict (key) do update set payload = excluded.payload, source = excluded.source, fetched_at = now()`,
      [key, JSON.stringify(fresh.data), fresh.source],
    );
    return { data: fresh.data, meta: { source: fresh.source, fetchedAt: new Date().toISOString(), stale: false } };
  } catch (e) {
    const msg = (e as Error).message;
    if (row) {
      return {
        data: row.payload,
        meta: { source: row.source, fetchedAt: new Date(row.fetched_at).toISOString(), stale: true, error: msg },
      };
    }
    throw new DataUnavailableError(msg);
  }
}
