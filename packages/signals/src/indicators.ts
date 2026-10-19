import type { Bar } from './types.js';

/** Series helpers. Every function returns an array aligned with its input; warm-up slots are null. */
export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values (the common charting convention). */
export function ema(values: Series, period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seed.push(v);
      if (seed.length === period) {
        prev = seed.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
        seed = [];
      }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line: Series = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );
  const sig = ema(line, signal);
  const hist: Series = line.map((v, i) => (v != null && sig[i] != null ? v - (sig[i] as number) : null));
  return { line, signal: sig, hist };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: Series = new Array(closes.length).fill(null);
  const lower: Series = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i] as number;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (closes[j] - m) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's Average True Range. */
export function atr(bars: Bar[], period = 14): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr = bars.map((b, i) =>
    i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)),
  );
  let a = 0;
  for (let i = 1; i <= period; i++) a += tr[i];
  a /= period;
  out[period] = a;
  for (let i = period + 1; i < bars.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

/** Chaikin Accumulation/Distribution line. */
export function accumulationDistribution(bars: Bar[]): number[] {
  const out: number[] = [];
  let ad = 0;
  for (const b of bars) {
    const range = b.h - b.l;
    const mfm = range === 0 ? 0 : (b.c - b.l - (b.h - b.c)) / range;
    ad += mfm * b.v;
    out.push(ad);
  }
  return out;
}

/** Least-squares slope of the last `n` points. */
export function slope(values: number[], end: number, n: number): number | null {
  const start = end - n + 1;
  if (start < 0) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const y = values[start + i];
    sx += i;
    sy += y;
    sxy += i * y;
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  return denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
}

/**
 * Nearest support (highest swing low below price) and resistance (lowest swing high above price)
 * within a lookback window. A swing point is a bar whose low/high is the extreme of ±`wing` bars.
 */
export function supportResistance(bars: Bar[], end: number, lookback = 120, wing = 3) {
  const price = bars[end].c;
  let support: number | null = null;
  let resistance: number | null = null;
  const start = Math.max(wing, end - lookback);
  for (let i = start; i <= end - wing; i++) {
    let isLow = true;
    let isHigh = true;
    for (let j = i - wing; j <= i + wing; j++) {
      if (j === i) continue;
      if (bars[j].l < bars[i].l) isLow = false;
      if (bars[j].h > bars[i].h) isHigh = false;
    }
    if (isLow && bars[i].l < price && (support == null || bars[i].l > support)) support = bars[i].l;
    if (isHigh && bars[i].h > price && (resistance == null || bars[i].h < resistance)) resistance = bars[i].h;
  }
  return { support, resistance };
}

/** Precomputed indicator series, so a backtest can snapshot any bar in O(1). */
export interface IndicatorSet {
  bars: Bar[];
  closes: number[];
  sma50: Series;
  sma200: Series;
  rsi14: Series;
  macd: ReturnType<typeof macd>;
  bb: ReturnType<typeof bollinger>;
  atr14: Series;
  ad: number[];
  volSma20: Series;
  dollarVolSma20: Series;
}

export function computeIndicators(bars: Bar[]): IndicatorSet {
  const closes = bars.map((b) => b.c);
  const vols = bars.map((b) => b.v);
  return {
    bars,
    closes,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bb: bollinger(closes),
    atr14: atr(bars),
    ad: accumulationDistribution(bars),
    volSma20: sma(vols, 20),
    dollarVolSma20: sma(
      bars.map((b) => b.c * b.v),
      20,
    ),
  };
}
