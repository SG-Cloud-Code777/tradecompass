import type { Bar } from '@tradecompass/signals';
import { config } from '../config.js';
import { one, q } from '../db/pool.js';
import { cached, DataUnavailableError, type Meta } from '../lib/cache.js';
import { mapLimit } from '../lib/http.js';
import { lastCompletedSession, marketOf, marketStatus } from '../lib/marketHours.js';
import { marketData } from '../providers/index.js';
import type { Quote } from '../providers/types.js';

const HISTORY_YEARS = 5;

async function storeBars(symbol: string, bars: Bar[]) {
  if (!bars.length) return;
  const d = bars.map((b) => new Date(b.t * 1000).toISOString().slice(0, 10));
  await q(
    `insert into price_bars (symbol, d, o, h, l, c, v)
     select $1, * from unnest($2::date[], $3::float8[], $4::float8[], $5::float8[], $6::float8[], $7::bigint[])
     on conflict (symbol, d) do update set o=excluded.o, h=excluded.h, l=excluded.l, c=excluded.c, v=excluded.v`,
    [symbol, d, bars.map((b) => b.o), bars.map((b) => b.h), bars.map((b) => b.l), bars.map((b) => b.c), bars.map((b) => Math.round(b.v))],
  );
}

export async function readBars(symbol: string, sinceDays = HISTORY_YEARS * 366): Promise<Bar[]> {
  const rows = await q<{ d: string; o: number; h: number; l: number; c: number; v: number }>(
    `select d, o, h, l, c, v from price_bars where symbol = $1 and d >= current_date - $2::int order by d`,
    [symbol, sinceDays],
  );
  return rows.map((r) => ({ t: Date.parse(`${r.d}T00:00:00Z`) / 1000, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }));
}

/** Daily bars (5y) — refreshed hourly, served from Postgres, flagged stale if the latest session is missing. */
export async function getBars(symbol: string, opts: { force?: boolean } = {}): Promise<{ bars: Bar[]; meta: Meta & { lastBar: string | null } }> {
  let meta: Meta;
  try {
    const res = await cached(
      `bars:${symbol}`,
      config.ttl.barsSec,
      async () => {
        const { data, source } = await marketData.bars(symbol, HISTORY_YEARS);
        await storeBars(symbol, data);
        return { data: { count: data.length }, source };
      },
      opts,
    );
    meta = res.meta;
  } catch (e) {
    if (!(e instanceof DataUnavailableError)) throw e;
    const have = await one(`select 1 from price_bars where symbol = $1 limit 1`, [symbol]);
    if (!have) throw e;
    meta = { source: 'cache', fetchedAt: new Date(0).toISOString(), stale: true, error: e.message };
  }
  const bars = await readBars(symbol);
  if (!bars.length) throw new DataUnavailableError(`No price history available for ${symbol}`);
  const lastBar = new Date(bars[bars.length - 1].t * 1000).toISOString().slice(0, 10);
  const expected = lastCompletedSession(marketOf(symbol));
  const lagDays = (Date.parse(expected) - Date.parse(lastBar)) / 86_400_000;
  if (lagDays * 86_400 > config.staleAfterSec.bars) {
    meta = { ...meta, stale: true, error: meta.error ?? `Latest bar is ${lastBar}; expected ${expected}` };
  }
  return { bars, meta: { ...meta, lastBar } };
}

export interface QuoteWithMeta extends Quote {
  meta: Meta;
}

export async function getQuote(symbol: string, opts: { force?: boolean } = {}): Promise<QuoteWithMeta> {
  const row = await one<any>(`select * from quotes where symbol = $1`, [symbol]);
  const status = marketStatus(marketOf(symbol));
  const ttl = status.open ? config.ttl.quoteSec : 15 * 60;
  const age = row ? (Date.now() - new Date(row.fetched_at).getTime()) / 1000 : Infinity;
  const fromRow = (r: any, meta: Meta): QuoteWithMeta => ({
    symbol,
    price: r.price,
    prevClose: r.prev_close,
    changePct: r.change_pct,
    currency: r.currency,
    asOf: r.as_of ? new Date(r.as_of).toISOString() : null,
    meta,
  });
  if (row && age < ttl && !opts.force)
    return fromRow(row, { source: row.source, fetchedAt: new Date(row.fetched_at).toISOString(), stale: quoteStale(row.as_of, status.open) });
  try {
    const { data, source } = await marketData.quote(symbol);
    await q(
      `insert into quotes (symbol, price, prev_close, change_pct, currency, as_of, source, fetched_at)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (symbol) do update set price=excluded.price, prev_close=excluded.prev_close, change_pct=excluded.change_pct,
         currency=excluded.currency, as_of=excluded.as_of, source=excluded.source, fetched_at=now()`,
      [symbol, data.price, data.prevClose, data.changePct, data.currency, data.asOf, source],
    );
    return { ...data, meta: { source, fetchedAt: new Date().toISOString(), stale: quoteStale(data.asOf, status.open) } };
  } catch (e) {
    if (row)
      return fromRow(row, { source: row.source, fetchedAt: new Date(row.fetched_at).toISOString(), stale: true, error: (e as Error).message });
    throw new DataUnavailableError((e as Error).message);
  }
}

/** During market hours a quote older than 30 min is stale (free feeds are typically 15-min delayed). */
function quoteStale(asOf: string | Date | null, open: boolean) {
  if (!asOf || !open) return false;
  return (Date.now() - new Date(asOf).getTime()) / 1000 > config.staleAfterSec.quote;
}

export async function getQuotes(symbols: string[]) {
  const res = await mapLimit(symbols, 6, (s) => getQuote(s));
  const out = new Map<string, QuoteWithMeta>();
  const errors: Record<string, string> = {};
  res.forEach((r, i) => (r.ok ? out.set(symbols[i], r.value) : (errors[symbols[i]] = r.error)));
  return { quotes: out, errors };
}

/** n-bar % change and whether the last close is above its 50-day average, from stored bars. */
export async function barStats(symbols: string[]) {
  const rows = await q<{ symbol: string; c: number; c20: number | null; sma50: number | null }>(
    `with ranked as (
       select symbol, c, row_number() over (partition by symbol order by d desc) rn
       from price_bars where symbol = any($1) and d >= current_date - 120)
     select symbol,
            max(c) filter (where rn = 1) c,
            max(c) filter (where rn = 21) c20,
            avg(c) filter (where rn <= 50) sma50
     from ranked group by symbol`,
    [symbols],
  );
  return new Map(rows.map((r) => [r.symbol, { ret20: r.c20 ? r.c / r.c20 - 1 : null, above50: r.sma50 != null ? r.c > r.sma50 : null }]));
}
