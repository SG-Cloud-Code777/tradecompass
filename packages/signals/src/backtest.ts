import { computeIndicators } from './indicators.js';
import { buildPlan } from './plan.js';
import { THRESHOLDS, scoreSnapshot, snapshotAt } from './score.js';
import type { Bar, Market, SectorId } from './types.js';

export interface BacktestTrade {
  entryT: number;
  exitT: number;
  entry: number;
  exit: number;
  /** Net return including costs, as a fraction. */
  ret: number;
  bars: number;
  exitReason: 'stop' | 'target' | 'signal' | 'end';
}

export interface BacktestResult {
  /** Only technical factors are replayed: historical fundamentals/13F data are not point-in-time. */
  method: string;
  from: number;
  to: number;
  trades: BacktestTrade[];
  tradeCount: number;
  winRate: number | null;
  avgGain: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  totalReturn: number;
  buyHoldReturn: number;
  maxDrawdown: number;
  exposure: number;
  worstTrade: BacktestTrade | null;
  yearly: { year: number; ret: number }[];
  costPerSide: number;
  equity: { t: number; v: number }[];
}

export interface BacktestOptions {
  market?: Market;
  sector?: SectorId;
  /** Slippage + commission per side, as a fraction. */
  costPerSide?: number;
  warmup?: number;
}

/**
 * Walk-forward replay of the rule set, long-only, fully invested while in a trade:
 *  - Enter at the NEXT bar's open when the technical score is ≥ BUY threshold.
 *  - Exit at the stop (or the open if it gaps through), at target 2, or at the next open after the score turns SELL.
 * No look-ahead: decisions at bar i only use data up to bar i.
 */
export function backtest(bars: Bar[], opts: BacktestOptions = {}): BacktestResult {
  const cost = opts.costPerSide ?? 0.001;
  const warmup = opts.warmup ?? 200;
  const empty: BacktestResult = {
    method: 'technical-only',
    from: bars[0]?.t ?? 0,
    to: bars[bars.length - 1]?.t ?? 0,
    trades: [],
    tradeCount: 0,
    winRate: null,
    avgGain: null,
    avgLoss: null,
    expectancy: null,
    totalReturn: 0,
    buyHoldReturn: 0,
    maxDrawdown: 0,
    exposure: 0,
    worstTrade: null,
    yearly: [],
    costPerSide: cost,
    equity: [],
  };
  if (bars.length < warmup + 20) return empty;

  const set = computeIndicators(bars);
  const trades: BacktestTrade[] = [];
  const equity: { t: number; v: number }[] = [];
  let cash = 1;
  let pos: { entry: number; entryIdx: number; stop: number; target: number; units: number } | null = null;
  let pendingEntry: { stop: number; target: number } | null = null;
  let pendingExit = false;
  let barsInMarket = 0;

  const close = (i: number, price: number, reason: BacktestTrade['exitReason']) => {
    const p = pos!;
    const proceeds = p.units * price * (1 - cost);
    trades.push({
      entryT: bars[p.entryIdx].t,
      exitT: bars[i].t,
      entry: p.entry,
      exit: price,
      ret: proceeds / cash - 1,
      bars: i - p.entryIdx,
      exitReason: reason,
    });
    cash = proceeds;
    pos = null;
  };

  for (let i = warmup; i < bars.length; i++) {
    const b = bars[i];
    if (pendingEntry && !pos) {
      const entry = b.o;
      pos = { entry, entryIdx: i, stop: pendingEntry.stop, target: pendingEntry.target, units: (cash * (1 - cost)) / entry };
      pendingEntry = null;
    } else if (pendingExit && pos) {
      close(i, b.o, 'signal');
      pendingExit = false;
    }

    if (pos) {
      barsInMarket++;
      if (b.o <= pos.stop) close(i, b.o, 'stop');
      else if (b.l <= pos.stop) close(i, pos.stop, 'stop');
      else if (b.o >= pos.target) close(i, b.o, 'target');
      else if (b.h >= pos.target) close(i, pos.target, 'target');
    }

    const sig = scoreSnapshot(snapshotAt(set, i), { sector: opts.sector });
    if (pos && sig.score <= THRESHOLDS.sell && i < bars.length - 1) pendingExit = true;
    if (!pos && sig.score >= THRESHOLDS.buy && i < bars.length - 1) {
      const plan = buildPlan(sig, { market: opts.market ?? 'US', sector: opts.sector });
      pendingEntry = { stop: plan.stop, target: plan.target2 };
    }
    equity.push({ t: b.t, v: pos ? pos.units * b.c : cash });
  }
  if (pos) close(bars.length - 1, bars[bars.length - 1].c, 'end');

  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.v);
    maxDrawdown = Math.min(maxDrawdown, e.v / peak - 1);
  }
  const yearly: { year: number; ret: number }[] = [];
  let yearStart = equity[0]?.v ?? 1;
  let curYear = equity.length ? new Date(equity[0].t * 1000).getUTCFullYear() : 0;
  for (let k = 0; k < equity.length; k++) {
    const y = new Date(equity[k].t * 1000).getUTCFullYear();
    if (y !== curYear) {
      yearly.push({ year: curYear, ret: equity[k - 1].v / yearStart - 1 });
      yearStart = equity[k - 1].v;
      curYear = y;
    }
  }
  if (equity.length) yearly.push({ year: curYear, ret: equity[equity.length - 1].v / yearStart - 1 });

  const wins = trades.filter((t) => t.ret > 0);
  const losses = trades.filter((t) => t.ret <= 0);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    ...empty,
    from: bars[warmup].t,
    trades,
    tradeCount: trades.length,
    winRate: trades.length ? wins.length / trades.length : null,
    avgGain: mean(wins.map((t) => t.ret)),
    avgLoss: mean(losses.map((t) => t.ret)),
    expectancy: mean(trades.map((t) => t.ret)),
    totalReturn: cash - 1,
    buyHoldReturn: bars[bars.length - 1].c / bars[warmup].o - 1,
    maxDrawdown,
    exposure: barsInMarket / (bars.length - warmup),
    worstTrade: trades.length ? trades.reduce((a, t) => (t.ret < a.ret ? t : a)) : null,
    yearly,
    equity,
  };
}
