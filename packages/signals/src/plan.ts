import { SECTORS } from './sectors.js';
import type { Market, PositionSize, SectorId, SignalResult, TradePlan } from './types.js';

export interface PlanOptions {
  market: Market;
  sector?: SectorId;
  /** TSX Venture listing (.V) — junior issuer warnings. */
  isVenture?: boolean;
  isLeveraged?: boolean;
  isEtf?: boolean;
  daysToEarnings?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Long-only trade geometry from the latest snapshot.
 *   entry zone  = [max(support, close − 0.5·ATR), close]
 *   stop        = support − 0.5·ATR if support is within 3·ATR below the entry, else entryLow − 1.5·ATR
 *   R           = entryMid − stop
 *   target 1    = nearest resistance if it is ≥ 1.5R away, else entryMid + 2R
 *   target 2    = max(entryMid + 3R, target1 + R)
 * For SELL labels the same levels are returned but `side` is 'none' (exit/avoid — the app never suggests shorting).
 */
export function buildPlan(sig: SignalResult, opts: PlanOptions): TradePlan {
  const s = sig.snapshot;
  const atr = s.atr14 ?? s.close * 0.02;
  const entryHigh = s.close;
  const entryLow = Math.min(s.close, Math.max(s.support ?? -Infinity, s.close - 0.5 * atr));
  const entryMid = (entryLow + entryHigh) / 2;
  let stop =
    s.support != null && s.support < entryLow && s.support > s.close - 3 * atr ? s.support - 0.5 * atr : entryLow - 1.5 * atr;
  if (stop <= 0) stop = entryLow * 0.5;
  const R = entryMid - stop;
  const target1 = s.resistance != null && s.resistance - entryMid >= 1.5 * R ? s.resistance : entryMid + 2 * R;
  const target2 = Math.max(entryMid + 3 * R, target1 + R);
  const profile = opts.sector ? SECTORS[opts.sector] : undefined;

  const holdUntil: string[] = [];
  if (s.sma50 != null) holdUntil.push(`Price keeps closing above the 50-day MA (now ${r2(s.sma50)})`);
  if (s.sma50 != null && s.sma200 != null)
    holdUntil.push(s.sma50 >= s.sma200 ? 'The 50-day MA stays above the 200-day MA (no death cross)' : 'Trend repairs: the 50-day MA turns up toward the 200-day MA');
  holdUntil.push(`Target 1 (${r2(target1)}) has not been reached yet`);
  if (!opts.isEtf) holdUntil.push('The investment thesis holds: revenue/EPS trends intact, no dividend cut, no major dilution');

  const sellIf = [
    `Stop-loss: a daily close below ${r2(stop)}`,
    s.sma50 != null ? `Trend break: a close below the 50-day MA (${r2(s.sma50)}) on above-average volume` : 'Trend break: lower highs and lower lows form',
    `Target reached: at ${r2(target1)} consider selling half and raising the stop to break-even; at ${r2(target2)} take more profit`,
    'Overbought and weakening: RSI above 70 and the MACD histogram turning down',
    'Signal flips to SELL or STRONG SELL',
    ...(profile ? profile.thesisBreakers.map((t) => `Thesis broken: ${t.toLowerCase()}`) : []),
  ];

  const bullish = sig.label === 'BUY' || sig.label === 'STRONG BUY' || sig.label === 'HOLD';
  const invalidation: string[] = [];
  if (bullish) {
    invalidation.push(`A daily close below ${r2(stop)} means the setup failed — exit, don't average down`);
    if (s.sma50 != null && s.sma200 != null) invalidation.push('The 50-day MA crossing below the 200-day MA (death cross)');
    if (profile) invalidation.push(profile.invalidation);
  } else {
    // What would invalidate the bearish reading.
    if (s.sma50 != null) invalidation.push(`Price reclaiming the 50-day MA (${r2(s.sma50)}) on strong volume`);
    if (s.sma200 != null) invalidation.push(`A sustained close back above the 200-day MA (${r2(s.sma200)})`);
    if (s.sma50 != null && s.sma200 != null && s.sma50 < s.sma200) invalidation.push('A golden cross (50-day MA back above the 200-day MA)');
    invalidation.push('The signal score rising back above −20 (HOLD) or into BUY territory');
  }

  const risks: string[] = [];
  const atrPct = atr / s.close;
  risks.push(`Volatility: a typical day moves about ±${(atrPct * 100).toFixed(1)}% (±${r2(atr)})`);
  const pennyLimit = opts.market === 'US' ? 5 : 1;
  if (s.close < pennyLimit)
    risks.push(`Penny stock (under ${opts.market === 'US' ? '$5' : 'C$1'}): wide spreads, easy to manipulate, and prone to large gaps`);
  if (s.avgDollarVolume20 != null && s.avgDollarVolume20 < 1_000_000)
    risks.push('Low liquidity: under $1M traded per day — use limit orders; your stop may fill well below the stop price');
  if (opts.isVenture)
    risks.push('TSX Venture junior: often pre-revenue and dependent on new share issues (dilution); exploration results can halve the price overnight');
  if (opts.isLeveraged)
    risks.push('Leveraged/inverse ETF: resets daily and decays over time — not designed for multi-day holds');
  if ((opts.sector === 'mining' || opts.sector === 'gold' || opts.sector === 'silver') && !opts.isEtf)
    risks.push('Mining stocks carry jurisdiction, permitting and operational risk on top of commodity-price risk');
  if (opts.daysToEarnings != null && opts.daysToEarnings >= 0 && opts.daysToEarnings <= 14)
    risks.push(`Earnings in ${opts.daysToEarnings} day(s): price can gap through your stop on the report`);
  if (sig.confidence.level === 'Low') risks.push('Low confidence: data coverage is thin or the factors disagree');
  risks.push('Signals are rules applied to past data — they are often wrong, and past results do not guarantee future results');

  return {
    side: bullish ? 'long' : 'none',
    entryLow: r2(entryLow),
    entryHigh: r2(entryHigh),
    stop: r2(stop),
    target1: r2(target1),
    target2: r2(target2),
    riskReward: R > 0 ? r2((target1 - entryMid) / R) : 0,
    holdUntil,
    sellIf,
    invalidation,
    risks,
  };
}

/**
 * Fixed-fractional position sizing:
 *   shares = floor(portfolio × risk% ÷ (entry − stop))
 * then capped so a single position is at most `maxAllocation` of the portfolio and no more than available cash.
 */
export function positionSize(
  portfolioValue: number,
  riskPct: number,
  entry: number,
  stop: number,
  opts: { maxAllocation?: number; cash?: number } = {},
): PositionSize {
  const maxAllocation = opts.maxAllocation ?? 0.25;
  const riskPerShare = entry - stop;
  if (riskPerShare <= 0 || entry <= 0 || portfolioValue <= 0)
    return { shares: 0, positionValue: 0, riskAmount: 0, riskPerShare: Math.max(0, riskPerShare), pctOfPortfolio: 0, cappedBy: null };
  let shares = Math.floor((portfolioValue * riskPct) / riskPerShare);
  let cappedBy: PositionSize['cappedBy'] = 'risk';
  const maxByAlloc = Math.floor((portfolioValue * maxAllocation) / entry);
  if (shares > maxByAlloc) {
    shares = maxByAlloc;
    cappedBy = 'maxAllocation';
  }
  if (opts.cash != null) {
    const maxByCash = Math.floor(opts.cash / entry);
    if (shares > maxByCash) {
      shares = maxByCash;
      cappedBy = 'cash';
    }
  }
  const positionValue = shares * entry;
  return {
    shares,
    positionValue: r2(positionValue),
    riskAmount: r2(shares * riskPerShare),
    riskPerShare: r2(riskPerShare),
    pctOfPortfolio: positionValue / portfolioValue,
    cappedBy,
  };
}
