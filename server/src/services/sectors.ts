import { SECTOR_ORDER, SECTORS, type Market, type SectorId } from '@tradecompass/signals';
import { q } from '../db/pool.js';
import { mapLimit } from '../lib/http.js';
import { barStats, getQuotes } from './prices.js';
import { listSecurities } from './securities.js';
import { computeSignal } from './signals.js';

type Trend = 'up' | 'flat' | 'down';

/** Sector trend: equal-weight 20-day return of members, confirmed by breadth (share above their 50-day MA). */
export function sectorTrend(stats: { ret20: number | null; above50: boolean | null }[]): { trend: Trend | null; avgRet20: number | null; breadth: number | null } {
  const rets = stats.map((s) => s.ret20).filter((x): x is number => x != null);
  const ab = stats.map((s) => s.above50).filter((x): x is boolean => x != null);
  if (!rets.length) return { trend: null, avgRet20: null, breadth: null };
  const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
  const breadth = ab.length ? ab.filter(Boolean).length / ab.length : null;
  let trend: Trend = 'flat';
  if (avg > 0.02 && (breadth == null || breadth >= 0.5)) trend = 'up';
  else if (avg < -0.02 && (breadth == null || breadth <= 0.5)) trend = 'down';
  return { trend, avgRet20: avg, breadth };
}

async function signalsFor(symbols: string[]) {
  const rows = await q<{ symbol: string; score: number; label: string; confidence: string; as_of: string }>(
    `select symbol, score, label, confidence, as_of from signals where symbol = any($1)`,
    [symbols],
  );
  return new Map(rows.map((r) => [r.symbol, r]));
}

export async function sectorView(market: Market, sector: SectorId, opts: { computeMissing?: number } = {}) {
  const members = await listSecurities(market, sector);
  const symbols = members.map((m) => m.symbol);
  const { quotes, errors } = await getQuotes(symbols);
  let signals = await signalsFor(symbols);
  const missing = symbols.filter((s) => !signals.has(s)).slice(0, opts.computeMissing ?? 0);
  if (missing.length) {
    await mapLimit(missing, 3, (s) => computeSignal(s));
    signals = await signalsFor(symbols);
  }
  const stats = await barStats(symbols);
  const rows = members.map((m) => {
    const qt = quotes.get(m.symbol);
    return {
      symbol: m.symbol,
      name: m.name,
      exchange: m.exchange,
      kind: m.kind,
      currency: m.currency,
      flags: { venture: m.is_venture, leveraged: m.is_leveraged, cadHedged: m.cad_hedged },
      notes: m.notes,
      price: qt?.price ?? null,
      changePct: qt?.changePct ?? null,
      quoteMeta: qt?.meta ?? null,
      error: errors[m.symbol] ?? null,
      signal: signals.get(m.symbol) ?? null,
      ret20: stats.get(m.symbol)?.ret20 ?? null,
    };
  });
  const withChange = rows.filter((r) => r.changePct != null);
  const movers = [...withChange].sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!)).slice(0, 5);
  const fetched = rows.map((r) => r.quoteMeta?.fetchedAt).filter(Boolean).sort();
  return {
    market,
    sector: SECTORS[sector],
    ...sectorTrend([...stats.values()]),
    movers,
    members: rows,
    lastUpdated: fetched[fetched.length - 1] ?? null,
    stale: rows.some((r) => r.quoteMeta?.stale) || Object.keys(errors).length > 0,
    errors,
  };
}

/** Heatmap tiles: average daily % change per sector (equal-weighted) and 20-day trend. */
export async function heatmap(market: Market) {
  const all = await listSecurities(market);
  const { quotes, errors } = await getQuotes(all.map((s) => s.symbol));
  const stats = await barStats(all.map((s) => s.symbol));
  return SECTOR_ORDER.map((id) => {
    const members = all.filter((s) => s.sector === id);
    const changes = members.map((m) => quotes.get(m.symbol)?.changePct).filter((x): x is number => x != null);
    const t = sectorTrend(members.map((m) => stats.get(m.symbol) ?? { ret20: null, above50: null }));
    return {
      id,
      name: SECTORS[id].name,
      emoji: SECTORS[id].emoji,
      changePct: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
      coverage: `${changes.length}/${members.length}`,
      trend: t.trend,
      avgRet20: t.avgRet20,
      errors: members.filter((m) => errors[m.symbol]).length,
    };
  });
}
