import { computeIndicators, slope, supportResistance, type IndicatorSet } from './indicators.js';
import { SECTORS } from './sectors.js';
import type {
  Bar,
  Confidence,
  Direction,
  Factor,
  FactorResult,
  Fundamentals,
  Macro,
  Reason,
  SectorId,
  SignalLabel,
  SignalResult,
  SmartMoney,
  TechnicalSnapshot,
} from './types.js';

/** Factor weights out of 100. Unavailable factors drop out and the rest are re-normalised. */
export const WEIGHTS: Record<Factor, number> = {
  trend: 25,
  momentum: 20,
  volume: 10,
  levels: 10,
  fundamentals: 20,
  macro: 10,
  smartMoney: 5,
};

export const THRESHOLDS = { strongBuy: 60, buy: 20, sell: -20, strongSell: -60 } as const;

export function labelFor(score: number): SignalLabel {
  if (score >= THRESHOLDS.strongBuy) return 'STRONG BUY';
  if (score >= THRESHOLDS.buy) return 'BUY';
  if (score > THRESHOLDS.sell) return 'HOLD';
  if (score > THRESHOLDS.strongSell) return 'SELL';
  return 'STRONG SELL';
}

export interface ScoreContext {
  sector?: SectorId;
  fundamentals?: Fundamentals | null;
  macro?: Macro | null;
  smartMoney?: SmartMoney | null;
}

/** A sub-reading inside a factor; `value` is in [-1, 1] and a factor's subs sum to its value. */
interface Sub {
  value: number;
  text: string;
}

const fmt = (n: number, d = 2) => n.toFixed(d);
const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;

export function snapshotAt(set: IndicatorSet, i: number): TechnicalSnapshot {
  const { bars } = set;
  const b = bars[i];
  const from = Math.max(0, i - 251);
  let high52w = -Infinity;
  let low52w = Infinity;
  for (let j = from; j <= i; j++) {
    high52w = Math.max(high52w, bars[j].h);
    low52w = Math.min(low52w, bars[j].l);
  }
  let crossAge: number | null = null;
  for (let j = i; j > 0; j--) {
    const a = set.sma50[j];
    const bb = set.sma200[j];
    const pa = set.sma50[j - 1];
    const pb = set.sma200[j - 1];
    if (a == null || bb == null || pa == null || pb == null) break;
    if (pa <= pb && a > bb) {
      crossAge = i - j;
      break;
    }
    if (pa >= pb && a < bb) {
      crossAge = -(i - j);
      break;
    }
  }
  const avgVol = set.volSma20[i];
  const adS = slope(set.ad, i, 20);
  const { support, resistance } = supportResistance(bars, i);
  return {
    close: b.c,
    sma50: set.sma50[i],
    sma200: set.sma200[i],
    rsi14: set.rsi14[i],
    macd: set.macd.line[i],
    macdSignal: set.macd.signal[i],
    macdHist: set.macd.hist[i],
    macdHistPrev: i > 0 ? set.macd.hist[i - 1] : null,
    bbUpper: set.bb.upper[i],
    bbLower: set.bb.lower[i],
    bbMid: set.bb.mid[i],
    atr14: set.atr14[i],
    high52w,
    low52w,
    volumeRatio: avgVol ? b.v / avgVol : null,
    adSlope: avgVol && adS != null ? adS / avgVol : null,
    crossAge,
    support,
    resistance,
    avgDollarVolume20: set.dollarVolSma20[i],
    change1d: i > 0 ? b.c / bars[i - 1].c - 1 : null,
  };
}

// ---------------------------------------------------------------- factors

function trendSubs(s: TechnicalSnapshot): Sub[] | null {
  const subs: Sub[] = [];
  if (s.sma200 != null) {
    subs.push(
      s.close > s.sma200
        ? { value: 0.35, text: `Price ${fmt(s.close)} is above the 200-day MA (${fmt(s.sma200)}) — long-term uptrend` }
        : { value: -0.35, text: `Price ${fmt(s.close)} is below the 200-day MA (${fmt(s.sma200)}) — long-term downtrend` },
    );
    if (s.sma50 != null) {
      const fresh = s.crossAge != null && Math.abs(s.crossAge) <= 20;
      if (s.sma50 > s.sma200)
        subs.push({
          value: 0.35,
          text: fresh ? `Golden cross ${Math.abs(s.crossAge!)} days ago (50-day crossed above 200-day)` : '50-day MA is above the 200-day MA',
        });
      else
        subs.push({
          value: -0.35,
          text: fresh ? `Death cross ${Math.abs(s.crossAge!)} days ago (50-day crossed below 200-day)` : '50-day MA is below the 200-day MA',
        });
    }
  }
  if (s.sma50 != null) {
    subs.push(
      s.close > s.sma50
        ? { value: 0.3, text: `Price is above the 50-day MA (${fmt(s.sma50)})` }
        : { value: -0.3, text: `Price is below the 50-day MA (${fmt(s.sma50)})` },
    );
  }
  return subs.length ? subs : null;
}

function momentumSubs(s: TechnicalSnapshot): Sub[] | null {
  const subs: Sub[] = [];
  const r = s.rsi14;
  if (r != null) {
    if (r < 30) subs.push({ value: 0.4, text: `RSI ${fmt(r, 0)} is oversold (<30) — selling may be exhausted` });
    else if (r < 45) subs.push({ value: -0.1, text: `RSI ${fmt(r, 0)} shows weak momentum` });
    else if (r < 55) subs.push({ value: 0, text: `RSI ${fmt(r, 0)} is neutral` });
    else if (r <= 65) subs.push({ value: 0.2, text: `RSI ${fmt(r, 0)} shows healthy momentum` });
    else if (r <= 70) subs.push({ value: 0.1, text: `RSI ${fmt(r, 0)} is strong but nearing overbought` });
    else subs.push({ value: -0.4, text: `RSI ${fmt(r, 0)} is overbought (>70) — pullback risk` });
  }
  const h = s.macdHist;
  const hp = s.macdHistPrev;
  if (h != null && hp != null) {
    if (h > 0 && hp <= 0) subs.push({ value: 0.6, text: 'MACD just crossed above its signal line (bullish crossover)' });
    else if (h < 0 && hp >= 0) subs.push({ value: -0.6, text: 'MACD just crossed below its signal line (bearish crossover)' });
    else if (h > 0) subs.push(h >= hp ? { value: 0.4, text: 'MACD is above signal and strengthening' } : { value: 0.15, text: 'MACD is above signal but fading' });
    else subs.push(h <= hp ? { value: -0.4, text: 'MACD is below signal and weakening' } : { value: -0.15, text: 'MACD is below signal but improving' });
  }
  return subs.length ? subs : null;
}

function volumeSubs(s: TechnicalSnapshot): Sub[] | null {
  if (s.volumeRatio == null || s.adSlope == null) return null;
  const subs: Sub[] = [];
  const ad = Math.max(-0.5, Math.min(0.5, s.adSlope * 5));
  if (ad > 0.1) subs.push({ value: ad, text: 'Accumulation: the A/D line is rising (buying pressure into closes)' });
  else if (ad < -0.1) subs.push({ value: ad, text: 'Distribution: the A/D line is falling (selling pressure into closes)' });
  else subs.push({ value: ad, text: 'Accumulation/distribution is flat' });
  const vr = s.volumeRatio;
  const up = (s.change1d ?? 0) >= 0;
  if (vr >= 2) subs.push({ value: up ? 0.5 : -0.5, text: `Volume spike ${fmt(vr, 1)}× the 20-day average on a ${up ? 'up' : 'down'} day` });
  else if (vr >= 1.5) subs.push({ value: up ? 0.25 : -0.25, text: `Above-average volume (${fmt(vr, 1)}×) on a ${up ? 'up' : 'down'} day` });
  return subs;
}

function levelSubs(s: TechnicalSnapshot): Sub[] | null {
  const subs: Sub[] = [];
  if (s.bbUpper != null && s.bbLower != null && s.bbUpper > s.bbLower) {
    const pb = (s.close - s.bbLower) / (s.bbUpper - s.bbLower);
    if (pb < 0) subs.push({ value: 0.3, text: 'Price closed below the lower Bollinger Band — stretched to the downside' });
    else if (pb > 1) subs.push({ value: -0.3, text: 'Price closed above the upper Bollinger Band — stretched to the upside' });
  }
  if (s.close >= s.high52w * 0.97) subs.push({ value: 0.3, text: `Trading within 3% of the 52-week high (${fmt(s.high52w)}) — relative strength` });
  else if (s.close <= s.low52w * 1.1) subs.push({ value: -0.3, text: `Trading within 10% of the 52-week low (${fmt(s.low52w)}) — relative weakness` });
  const a = s.atr14;
  if (a != null) {
    if (s.support != null && s.close - s.support <= a)
      subs.push({ value: 0.4, text: `Close to support at ${fmt(s.support)} — risk can be defined tightly` });
    if (s.resistance != null && s.resistance - s.close <= a)
      subs.push({ value: -0.4, text: `Just under resistance at ${fmt(s.resistance)} — upside may stall` });
  }
  return subs.length ? subs : [{ value: 0, text: 'No notable band, 52-week or support/resistance signal' }];
}

function fundamentalSubs(f: Fundamentals | null | undefined): Sub[] | null {
  if (!f || f.isEtf) return null;
  const raw: Sub[] = [];
  if (f.isReit) {
    if (f.pFfo != null) {
      if (f.pFfo < 12) raw.push({ value: 0.6, text: `P/FFO ${fmt(f.pFfo, 1)} is inexpensive for a REIT` });
      else if (f.pFfo > 20) raw.push({ value: -0.4, text: `P/FFO ${fmt(f.pFfo, 1)} is rich for a REIT` });
      else raw.push({ value: 0, text: `P/FFO ${fmt(f.pFfo, 1)} is in a normal range` });
    }
    if (f.occupancy != null) {
      if (f.occupancy >= 0.95) raw.push({ value: 0.4, text: `Occupancy ${pct(f.occupancy, 1)} is high` });
      else if (f.occupancy < 0.9) raw.push({ value: -0.5, text: `Occupancy ${pct(f.occupancy, 1)} is weak` });
      else raw.push({ value: 0, text: `Occupancy ${pct(f.occupancy, 1)} is average` });
    }
  } else {
    if (f.pe != null) {
      if (f.pe <= 0) raw.push({ value: -0.6, text: 'Company is not profitable (negative P/E)' });
      else if (f.sectorPe != null && f.sectorPe > 0) {
        const r = f.pe / f.sectorPe;
        if (r < 0.8) raw.push({ value: 0.6, text: `P/E ${fmt(f.pe, 1)} is cheaper than the sector (${fmt(f.sectorPe, 1)})` });
        else if (r > 1.3) raw.push({ value: -0.4, text: `P/E ${fmt(f.pe, 1)} is pricier than the sector (${fmt(f.sectorPe, 1)})` });
        else raw.push({ value: 0, text: `P/E ${fmt(f.pe, 1)} is in line with the sector (${fmt(f.sectorPe, 1)})` });
      } else if (f.pe < 15) raw.push({ value: 0.4, text: `Low P/E of ${fmt(f.pe, 1)}` });
      else if (f.pe > 40) raw.push({ value: -0.4, text: `High P/E of ${fmt(f.pe, 1)}` });
      else raw.push({ value: 0, text: `P/E of ${fmt(f.pe, 1)}` });
    }
    if (f.epsGrowth != null) {
      if (f.epsGrowth > 0.15) raw.push({ value: 0.8, text: `EPS growing fast (${pct(f.epsGrowth)} YoY)` });
      else if (f.epsGrowth > 0) raw.push({ value: 0.3, text: `EPS growing (${pct(f.epsGrowth)} YoY)` });
      else raw.push({ value: -0.6, text: `EPS shrinking (${pct(f.epsGrowth)} YoY)` });
    }
    if (f.debtToEquity != null) {
      if (f.debtToEquity < 0.5) raw.push({ value: 0.4, text: `Low debt (D/E ${fmt(f.debtToEquity)})` });
      else if (f.debtToEquity > 2) raw.push({ value: -0.6, text: `High debt (D/E ${fmt(f.debtToEquity)})` });
    }
    if (f.priceToBook != null) {
      if (f.priceToBook > 0 && f.priceToBook < 1) raw.push({ value: 0.4, text: `Trading below book value (P/B ${fmt(f.priceToBook)})` });
      else if (f.priceToBook > 8) raw.push({ value: -0.3, text: `Very high P/B of ${fmt(f.priceToBook, 1)}` });
    }
  }
  if (f.revenueGrowth != null) {
    if (f.revenueGrowth > 0.1) raw.push({ value: 0.6, text: `Revenue growing ${pct(f.revenueGrowth)} YoY` });
    else if (f.revenueGrowth > 0) raw.push({ value: 0.2, text: `Revenue up ${pct(f.revenueGrowth)} YoY` });
    else raw.push({ value: -0.6, text: `Revenue down ${pct(f.revenueGrowth)} YoY` });
  }
  if (f.freeCashFlow != null) {
    raw.push(f.freeCashFlow > 0 ? { value: 0.5, text: 'Positive free cash flow' } : { value: -0.6, text: 'Negative free cash flow (burning cash)' });
  }
  if (f.dividendYield != null && f.dividendYield > 0 && f.payoutRatio != null) {
    if (f.payoutRatio > 1) raw.push({ value: -0.6, text: `Payout ratio ${pct(f.payoutRatio)} exceeds earnings — dividend at risk` });
    else if (f.payoutRatio < 0.75) raw.push({ value: 0.4, text: `Dividend ${pct(f.dividendYield, 1)} well covered (payout ${pct(f.payoutRatio)})` });
  }
  if (raw.length < 2) return null; // not enough data to judge
  return raw.map((s) => ({ value: s.value / raw.length, text: s.text }));
}

const dirValue = (d: Direction | null | undefined) => (d === 'up' ? 1 : d === 'down' ? -1 : d === 'flat' ? 0 : null);

function macroSubs(sector: SectorId | undefined, m: Macro | null | undefined): Sub[] | null {
  if (!sector || !m) return null;
  const profile = SECTORS[sector];
  const names: Record<string, string> = {
    rates: 'Interest rates',
    usd: 'US dollar',
    inflation: 'Inflation',
    commodity: profile.commodityName ?? 'Commodity',
  };
  const parts: { coef: number; dir: number; key: string }[] = [];
  for (const [key, coef] of Object.entries(profile.sensitivities)) {
    const d = dirValue(m[key as keyof Macro]);
    if (d == null || coef == null) continue;
    parts.push({ coef, dir: d, key });
  }
  if (!parts.length) return null;
  const denom = parts.reduce((a, p) => a + Math.abs(p.coef), 0);
  return parts.map((p) => {
    const v = (p.coef * p.dir) / denom;
    const dirWord = p.dir > 0 ? 'rising' : p.dir < 0 ? 'falling' : 'flat';
    const effect = v > 0 ? 'tailwind' : v < 0 ? 'headwind' : 'neutral';
    return { value: v, text: `${names[p.key]} ${dirWord} — ${effect} for ${profile.name.toLowerCase()}` };
  });
}

function smartMoneySubs(sm: SmartMoney | null | undefined): Sub[] | null {
  if (!sm) return null;
  const subs: Sub[] = [];
  const buyers = sm.insiderBuyers90d;
  const sellers = sm.insiderSellers90d;
  if (buyers != null) {
    if (buyers >= 3) subs.push({ value: 0.6, text: `Insider cluster buying: ${buyers} insiders bought on the open market in 90 days` });
    else if (buyers >= 1) subs.push({ value: 0.3, text: `${buyers} insider open-market purchase(s) in 90 days` });
    else if (sellers != null && sellers >= 3) subs.push({ value: -0.3, text: `${sellers} insiders sold and none bought in 90 days` });
  }
  if (sm.fundsAdding != null && sm.fundsTrimming != null) {
    const net = sm.fundsAdding - sm.fundsTrimming;
    if (net !== 0)
      subs.push({
        value: Math.max(-0.4, Math.min(0.4, net * 0.1)),
        text: `${sm.fundsAdding} tracked funds added vs ${sm.fundsTrimming} trimmed in the latest 13F (data up to 45 days old)`,
      });
  }
  return subs.length ? subs : null;
}

// ---------------------------------------------------------------- scoring

export function scoreSnapshot(snapshot: TechnicalSnapshot, ctx: ScoreContext = {}): SignalResult {
  const raw: [Factor, Sub[] | null][] = [
    ['trend', trendSubs(snapshot)],
    ['momentum', momentumSubs(snapshot)],
    ['volume', volumeSubs(snapshot)],
    ['levels', levelSubs(snapshot)],
    ['fundamentals', fundamentalSubs(ctx.fundamentals)],
    ['macro', macroSubs(ctx.sector, ctx.macro)],
    ['smartMoney', smartMoneySubs(ctx.smartMoney)],
  ];
  const availableWeight = raw.reduce((a, [f, subs]) => a + (subs ? WEIGHTS[f] : 0), 0);
  const factors: FactorResult[] = raw.map(([factor, subs]) => {
    if (!subs || availableWeight === 0) return { factor, value: 0, weight: 0, available: false, reasons: [] };
    const scale = (WEIGHTS[factor] / availableWeight) * 100;
    const value = subs.reduce((a, s) => a + s.value, 0);
    return {
      factor,
      value,
      weight: WEIGHTS[factor],
      available: true,
      reasons: subs.map((s) => ({ factor, points: s.value * scale, text: s.text })),
    };
  });
  const rawScore = factors.reduce((a, f) => a + f.reasons.reduce((b, r) => b + r.points, 0), 0);
  const score = Math.round(Math.max(-100, Math.min(100, rawScore)));
  const label = labelFor(score);
  return {
    score,
    label,
    factors,
    topReasons: topReasons(factors, score),
    confidence: confidence(factors, score, availableWeight),
    snapshot,
  };
}

function topReasons(factors: FactorResult[], score: number): Reason[] {
  const all = factors.flatMap((f) => f.reasons).filter((r) => Math.abs(r.points) >= 0.5);
  const hold = score > THRESHOLDS.sell && score < THRESHOLDS.buy;
  const sorted = hold
    ? all.sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    : all.filter((r) => Math.sign(r.points) === Math.sign(score)).sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return sorted.slice(0, 3);
}

function confidence(factors: FactorResult[], score: number, availableWeight: number): Confidence {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const coverage = availableWeight / total;
  const hold = score > THRESHOLDS.sell && score < THRESHOLDS.buy;
  let agreeing = 0;
  for (const f of factors) {
    if (!f.available) continue;
    if (hold ? Math.abs(f.value) < 0.3 : Math.sign(f.value) === Math.sign(score) && f.value !== 0) agreeing += f.weight;
  }
  const agreement = availableWeight ? agreeing / availableWeight : 0;
  // Agreement dominates: full data with split factors must not read as "High".
  const value = Math.round(100 * agreement * Math.sqrt(coverage));
  return { level: value >= 70 ? 'High' : value >= 45 ? 'Medium' : 'Low', value, coverage, agreement };
}

/** Convenience: score the latest bar of a price history. Needs >= 30 bars; 200+ for the full trend factor. */
export function scoreBars(bars: Bar[], ctx: ScoreContext = {}): SignalResult {
  if (bars.length < 30) throw new Error(`Need at least 30 daily bars to score, got ${bars.length}`);
  const set = computeIndicators(bars);
  return scoreSnapshot(snapshotAt(set, bars.length - 1), ctx);
}
