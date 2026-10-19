import type { Bar, Fundamentals } from '@tradecompass/signals';

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  changePct: number | null;
  currency: string | null;
  asOf: string | null; // ISO timestamp of the exchange price
}

export interface FundamentalsData extends Fundamentals {
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null;
  earningsDate?: string | null; // YYYY-MM-DD
  exDividendDate?: string | null;
  quoteType?: string | null;
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  summary?: string;
  /** -1..1 when the provider supplies sentiment; null otherwise. */
  sentiment: number | null;
  sentimentLabel: string | null;
}

export interface MarketDataProvider {
  name: string;
  /** Daily bars, oldest first. */
  bars(symbol: string, years: number): Promise<Bar[]>;
  quote(symbol: string): Promise<Quote>;
  fundamentals?(symbol: string): Promise<FundamentalsData>;
}
