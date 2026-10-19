import type { Bar } from '@tradecompass/signals';
import { config } from '../config.js';
import { alphaVantage } from './alphaVantage.js';
import { twelveData } from './twelveData.js';
import type { FundamentalsData, MarketDataProvider, Quote } from './types.js';
import { yahoo } from './yahoo.js';

const REGISTRY: Record<string, { provider: MarketDataProvider; enabled: () => boolean }> = {
  yahoo: { provider: yahoo, enabled: () => true },
  twelvedata: { provider: twelveData, enabled: () => !!config.twelveDataKey },
  alphavantage: { provider: alphaVantage, enabled: () => !!config.alphaVantageKey },
};

export function activeProviders(): MarketDataProvider[] {
  return config.providers.filter((n) => REGISTRY[n]?.enabled()).map((n) => REGISTRY[n].provider);
}

/** Try each configured provider in order; the error lists every failure so stale-data banners are explainable. */
async function firstOk<T>(fn: (p: MarketDataProvider) => Promise<T> | undefined): Promise<{ data: T; source: string }> {
  const errors: string[] = [];
  for (const p of activeProviders()) {
    try {
      const res = fn(p);
      if (!res) continue;
      return { data: await res, source: p.name };
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.length ? errors.join(' | ') : 'no market-data provider configured');
}

export const marketData = {
  bars: (symbol: string, years: number) => firstOk<Bar[]>((p) => p.bars(symbol, years)),
  quote: (symbol: string) => firstOk<Quote>((p) => p.quote(symbol)),
  fundamentals: (symbol: string) => firstOk<FundamentalsData>((p) => p.fundamentals?.(symbol)),
};
