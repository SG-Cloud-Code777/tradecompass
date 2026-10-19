/** One daily OHLCV bar. `t` is the session date as a Unix timestamp (seconds, UTC). */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Market = 'US' | 'CA';

export type SectorId =
  | 'gold'
  | 'silver'
  | 'copper'
  | 'oil_gas'
  | 'semis'
  | 'robotics_ai'
  | 'mining'
  | 'food_ag'
  | 'reits'
  | 'etfs'
  | 'dividend';

export type Direction = 'up' | 'flat' | 'down';

/** Fundamentals are optional field-by-field: missing data lowers confidence, it is never guessed. */
export interface Fundamentals {
  pe?: number | null;
  sectorPe?: number | null;
  epsGrowth?: number | null; // YoY, fraction (0.12 = 12%)
  revenueGrowth?: number | null; // YoY, fraction
  debtToEquity?: number | null; // ratio (1.0 = 100%)
  freeCashFlow?: number | null; // absolute, native currency
  dividendYield?: number | null; // fraction
  payoutRatio?: number | null; // fraction
  priceToBook?: number | null;
  // REIT-specific
  isReit?: boolean;
  pFfo?: number | null;
  occupancy?: number | null; // fraction
  isEtf?: boolean;
}

/** Recent direction of macro series (e.g. 20-day change of the 10Y yield). */
export interface Macro {
  rates?: Direction | null;
  usd?: Direction | null;
  inflation?: Direction | null;
  /** Trend of the commodity that drives this sector (gold for gold miners, WTI for oil, ...). */
  commodity?: Direction | null;
}

export interface SmartMoney {
  /** Number of distinct insiders with open-market purchases in last 90 days. */
  insiderBuyers90d?: number | null;
  /** Number of distinct insiders with open-market sales in last 90 days. */
  insiderSellers90d?: number | null;
  /** Tracked funds that added or opened a position in the latest 13F vs the prior one. */
  fundsAdding?: number | null;
  /** Tracked funds that trimmed or exited. */
  fundsTrimming?: number | null;
}

export type SignalLabel = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

export type Factor = 'trend' | 'momentum' | 'volume' | 'levels' | 'fundamentals' | 'macro' | 'smartMoney';

export interface Reason {
  factor: Factor;
  /** Contribution to the final score, in score points (-100..100 scale). */
  points: number;
  text: string;
}

export interface FactorResult {
  factor: Factor;
  /** Normalised factor reading in [-1, 1]. */
  value: number;
  /** Weight of the factor (out of 100) — 0 when no data was available. */
  weight: number;
  available: boolean;
  reasons: Reason[];
}

export interface TechnicalSnapshot {
  close: number;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  macdHistPrev: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbMid: number | null;
  atr14: number | null;
  high52w: number;
  low52w: number;
  volumeRatio: number | null; // today's volume / 20-day average
  adSlope: number | null; // 20-day slope of A/D line normalised by avg volume
  /** Bars since the 50/200 SMA last crossed; sign: + golden, - death. null if never. */
  crossAge: number | null;
  support: number | null;
  resistance: number | null;
  avgDollarVolume20: number | null;
  change1d: number | null;
}

export interface Confidence {
  level: 'Low' | 'Medium' | 'High';
  /** 0..100 */
  value: number;
  coverage: number; // fraction of total weight with data
  agreement: number; // fraction of available factor weight agreeing with the final sign
}

export interface SignalResult {
  score: number;
  label: SignalLabel;
  factors: FactorResult[];
  topReasons: Reason[];
  confidence: Confidence;
  snapshot: TechnicalSnapshot;
}

export interface TradePlan {
  side: 'long' | 'none';
  entryLow: number;
  entryHigh: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
  holdUntil: string[];
  sellIf: string[];
  invalidation: string[];
  risks: string[];
}

export interface PositionSize {
  shares: number;
  positionValue: number;
  riskAmount: number;
  riskPerShare: number;
  pctOfPortfolio: number;
  cappedBy: 'risk' | 'maxAllocation' | 'cash' | null;
}
