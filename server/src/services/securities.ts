import type { Market, SectorId } from '@tradecompass/signals';
import { one, q } from '../db/pool.js';
import { marketOf } from '../lib/marketHours.js';

export interface Security {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
  currency: 'USD' | 'CAD';
  sector: SectorId | 'other';
  kind: 'stock' | 'etf' | 'reit';
  is_venture: boolean;
  is_leveraged: boolean;
  cad_hedged: boolean;
  in_universe: boolean;
  notes: string | null;
}

export const normalizeSymbol = (s: string) => s.trim().toUpperCase();

export async function getSecurity(symbol: string): Promise<Security | null> {
  return one<Security>(`select * from securities where symbol = $1`, [normalizeSymbol(symbol)]);
}

/** Look up a security, registering unknown tickers (from search) so they can be tracked. */
export async function ensureSecurity(symbol: string, name?: string): Promise<Security> {
  const s = normalizeSymbol(symbol);
  const existing = await getSecurity(s);
  if (existing) return existing;
  const market = marketOf(s);
  const isVenture = /\.V$/.test(s);
  await q(
    `insert into securities (symbol, name, market, exchange, currency, sector, kind, is_venture, in_universe)
     values ($1,$2,$3,$4,$5,'other','stock',$6,false) on conflict do nothing`,
    [s, name ?? s, market, market === 'US' ? 'US' : isVenture ? 'TSXV' : 'TSX', market === 'US' ? 'USD' : 'CAD', isVenture],
  );
  return (await getSecurity(s))!;
}

export async function listSecurities(market: Market, sector?: string) {
  return q<Security>(
    `select * from securities where market = $1 and in_universe and ($2::text is null or sector = $2) order by sector, symbol`,
    [market, sector ?? null],
  );
}
