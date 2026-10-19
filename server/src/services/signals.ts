import { backtest, buildPlan, computeIndicators, scoreSnapshot, snapshotAt, type SectorId, type SmartMoney } from '@tradecompass/signals';
import { config } from '../config.js';
import { one, q } from '../db/pool.js';
import { marketOf } from '../lib/marketHours.js';
import { onCalendarEvent, onSignalChange } from './alerts.js';
import { getFundamentals, sectorPe } from './fundamentals.js';
import { macroSeries, toMacro } from './macro.js';
import { getBars } from './prices.js';
import { ensureSecurity } from './securities.js';
import { fundsForSymbol, insiderSummary, refreshInsiders } from './smartMoney.js';

const DISCLAIMER =
  'Educational only — not financial advice. Signals are rule-based readings of past data; they are often wrong, and past performance does not guarantee future results.';

/** Downsample an equity curve for the UI. */
const thin = <T>(xs: T[], n = 160) => (xs.length <= n ? xs : xs.filter((_, i) => i % Math.ceil(xs.length / n) === 0 || i === xs.length - 1));

export async function computeSignal(symbol: string, opts: { force?: boolean } = {}) {
  const sec = await ensureSecurity(symbol);
  const sector = sec.sector === 'other' ? undefined : (sec.sector as SectorId);
  const { bars, meta: barsMeta } = await getBars(sec.symbol, { force: opts.force });
  if (bars.length < 30) throw new Error(`Only ${bars.length} bars of history for ${sec.symbol} — not enough to score`);

  const [fund, macroList] = await Promise.all([getFundamentals(sec.symbol), macroSeries(sec.sector)]);
  const f = fund.data;
  const fundamentals = f
    ? {
        ...f,
        isEtf: f.isEtf || sec.kind === 'etf',
        isReit: f.isReit || sec.kind === 'reit',
        sectorPe: sector ? await sectorPe(sec.market, sector) : null,
      }
    : sec.kind === 'etf'
      ? { isEtf: true }
      : null;

  let smartMoney: SmartMoney | null = null;
  let funds: Awaited<ReturnType<typeof fundsForSymbol>> | null = null;
  try {
    if (sec.market === 'US' && sec.kind !== 'etf') await refreshInsiders(sec.symbol).catch(() => undefined);
    const ins = sec.market === 'US' ? await insiderSummary(sec.symbol) : null;
    funds = await fundsForSymbol(sec.symbol, sec.name);
    const fundsData = funds.holders.length ? { fundsAdding: funds.adding, fundsTrimming: funds.trimming } : {};
    if (ins || funds.holders.length)
      smartMoney = { ...(ins ? { insiderBuyers90d: ins.buyers90d, insiderSellers90d: ins.sellers90d } : {}), ...fundsData };
  } catch {
    smartMoney = null;
  }

  const set = computeIndicators(bars);
  const sig = scoreSnapshot(snapshotAt(set, bars.length - 1), { sector, fundamentals, macro: toMacro(macroList), smartMoney });
  const daysToEarnings = f?.earningsDate ? Math.round((Date.parse(f.earningsDate) - Date.now()) / 86_400_000) : null;
  const plan = buildPlan(sig, {
    market: sec.market,
    sector,
    isVenture: sec.is_venture,
    isLeveraged: sec.is_leveraged,
    isEtf: sec.kind === 'etf',
    daysToEarnings,
  });
  const bt = backtest(bars, { market: sec.market, sector });
  const asOf = barsMeta.lastBar!;

  const payload = {
    symbol: sec.symbol,
    name: sec.name,
    market: sec.market,
    exchange: sec.exchange,
    currency: sec.currency,
    sector: sec.sector,
    kind: sec.kind,
    flags: { venture: sec.is_venture, leveraged: sec.is_leveraged, cadHedged: sec.cad_hedged },
    notes: sec.notes,
    asOf,
    score: sig.score,
    label: sig.label,
    confidence: sig.confidence,
    factors: sig.factors,
    topReasons: sig.topReasons,
    snapshot: sig.snapshot,
    plan,
    backtest: {
      ...bt,
      equity: thin(bt.equity),
      trades: bt.trades.slice(-12).reverse(),
    },
    fundamentals: fundamentals ? { ...f, sectorPe: (fundamentals as any).sectorPe ?? null } : null,
    macro: macroList,
    smartMoney: { inputs: smartMoney, funds },
    events: { earningsDate: f?.earningsDate ?? null, exDividendDate: f?.exDividendDate ?? null, daysToEarnings },
    meta: { bars: barsMeta, fundamentals: fund.meta, computedAt: new Date().toISOString() },
    disclaimer: DISCLAIMER,
  };

  const prev = await one<{ label: string }>(`select label from signals where symbol = $1`, [sec.symbol]);
  await q(
    `insert into signals (symbol, as_of, score, label, confidence, payload, computed_at) values ($1,$2,$3,$4,$5,$6,now())
     on conflict (symbol) do update set as_of=excluded.as_of, score=excluded.score, label=excluded.label,
       confidence=excluded.confidence, payload=excluded.payload, computed_at=now()`,
    [sec.symbol, asOf, sig.score, sig.label, sig.confidence.level, JSON.stringify(payload)],
  );
  if (!prev || prev.label !== sig.label) {
    await q(`insert into signal_history (symbol, as_of, score, label, prev_label) values ($1,$2,$3,$4,$5)`, [
      sec.symbol,
      asOf,
      sig.score,
      sig.label,
      prev?.label ?? null,
    ]);
    if (prev) await onSignalChange(sec.symbol, prev.label, sig.label, sig.score, asOf);
  }
  if (f?.earningsDate) await onCalendarEvent(sec.symbol, 'earnings', f.earningsDate);
  if (f?.exDividendDate) await onCalendarEvent(sec.symbol, 'ex_dividend', f.exDividendDate);
  return payload;
}

/** Serve the stored signal if it's fresh enough; otherwise recompute. */
export async function getSignal(symbol: string, opts: { force?: boolean } = {}) {
  const row = await one<{ payload: any; computed_at: Date }>(`select payload, computed_at from signals where symbol = $1`, [symbol.toUpperCase()]);
  if (row && !opts.force && (Date.now() - new Date(row.computed_at).getTime()) / 1000 < config.ttl.signalSec) return row.payload;
  try {
    return await computeSignal(symbol, opts);
  } catch (e) {
    if (row) return { ...row.payload, meta: { ...row.payload.meta, bars: { ...row.payload.meta.bars, stale: true, error: (e as Error).message } } };
    throw e;
  }
}

export async function topSignals(market: 'US' | 'CA', limit = 8) {
  const rows = await q<{ symbol: string; score: number; label: string; confidence: string; as_of: string; computed_at: Date; name: string; sector: string }>(
    `select g.symbol, g.score, g.label, g.confidence, g.as_of, g.computed_at, s.name, s.sector
     from signals g join securities s on s.symbol = g.symbol where s.market = $1 and s.in_universe order by g.score desc`,
    [market],
  );
  const buys = rows.filter((r) => r.score >= 20).slice(0, limit);
  const sells = rows.filter((r) => r.score <= -20).reverse().slice(0, Math.ceil(limit / 2));
  const lastComputed = rows.reduce<Date | null>((a, r) => (!a || r.computed_at > a ? r.computed_at : a), null);
  return { buys, sells, coverage: rows.length, lastComputed };
}

export async function signalHistory(symbol: string) {
  return q(`select as_of, score, label, prev_label, computed_at from signal_history where symbol = $1 order by computed_at desc limit 20`, [symbol]);
}

