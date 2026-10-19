import { config } from '../config.js';
import { q } from '../db/pool.js';
import { cached, DataUnavailableError, type Meta } from '../lib/cache.js';
import { marketData } from '../providers/index.js';
import type { FundamentalsData } from '../providers/types.js';

export async function getFundamentals(symbol: string, opts: { force?: boolean } = {}): Promise<{ data: FundamentalsData | null; meta: Meta }> {
  try {
    return await cached(`fund:${symbol}`, config.ttl.fundamentalsSec, () => marketData.fundamentals(symbol), opts);
  } catch (e) {
    if (!(e instanceof DataUnavailableError)) throw e;
    return { data: null, meta: { source: 'none', fetchedAt: new Date().toISOString(), stale: true, error: e.message } };
  }
}

/** Median trailing P/E of profitable peers in the same market + sector, from cached fundamentals (no extra API calls). */
export async function sectorPe(market: string, sector: string): Promise<number | null> {
  const rows = await q<{ pe: number }>(
    `select (c.payload->>'pe')::float8 pe
     from securities s join api_cache c on c.key = 'fund:' || s.symbol
     where s.market = $1 and s.sector = $2 and s.kind = 'stock'
       and c.payload->>'pe' is not null and (c.payload->>'pe')::float8 > 0 and (c.payload->>'pe')::float8 < 300`,
    [market, sector],
  );
  if (rows.length < 3) return null;
  const pes = rows.map((r) => r.pe).sort((a, b) => a - b);
  const mid = Math.floor(pes.length / 2);
  return pes.length % 2 ? pes[mid] : (pes[mid - 1] + pes[mid]) / 2;
}
