import type { Bar } from '@tradecompass/signals';
import { config } from '../config.js';
import { getJson, ProviderError } from '../lib/http.js';
import type { FundamentalsData, MarketDataProvider, NewsItem, Quote } from './types.js';

const P = 'alphavantage';
const BASE = 'https://www.alphavantage.co/query';

/** Alpha Vantage uses .TRT (TSX) and .TRV (TSXV) suffixes. */
export const avSymbol = (s: string) => s.replace(/\.TO$/i, '.TRT').replace(/\.V$/i, '.TRV');

function check(json: any) {
  const msg = json?.Note ?? json?.Information ?? json?.['Error Message'];
  if (msg) throw new ProviderError(P, String(msg).slice(0, 160));
  return json;
}

async function call(params: Record<string, string>) {
  if (!config.alphaVantageKey) throw new ProviderError(P, 'ALPHAVANTAGE_API_KEY not set');
  const qs = new URLSearchParams({ ...params, apikey: config.alphaVantageKey });
  return check(await getJson(`${BASE}?${qs}`, { provider: P }));
}

export function parseDaily(json: any): Bar[] {
  const series = json['Time Series (Daily)'];
  if (!series) throw new ProviderError(P, 'no daily series');
  return Object.entries<any>(series)
    .map(([d, v]) => ({
      t: Date.parse(`${d}T00:00:00Z`) / 1000,
      o: Number(v['1. open']),
      h: Number(v['2. high']),
      l: Number(v['3. low']),
      c: Number(v['4. close']),
      v: Number(v['5. volume'] ?? 0),
    }))
    .sort((a, b) => a.t - b.t);
}

const num = (x: any) => (x == null || x === 'None' || x === '-' || x === '' ? null : Number(x));

export function parseOverview(j: any): FundamentalsData {
  if (!j?.Symbol) throw new ProviderError(P, 'empty overview');
  const eps = num(j.EPS);
  const dps = num(j.DividendPerShare);
  return {
    pe: num(j.TrailingPE) ?? num(j.PERatio),
    epsGrowth: num(j.QuarterlyEarningsGrowthYOY),
    revenueGrowth: num(j.QuarterlyRevenueGrowthYOY),
    priceToBook: num(j.PriceToBookRatio),
    dividendYield: num(j.DividendYield),
    payoutRatio: eps && dps != null && eps > 0 ? dps / eps : null,
    isReit: /REIT/i.test(j.Industry ?? '') || /REIT/i.test(j.AssetType ?? ''),
    isEtf: j.AssetType === 'ETF',
    sector: j.Sector ?? null,
    industry: j.Industry ?? null,
    marketCap: num(j.MarketCapitalization),
    exDividendDate: j.ExDividendDate && j.ExDividendDate !== 'None' ? j.ExDividendDate : null,
  };
}

export function parseNews(json: any, symbol: string): NewsItem[] {
  return (json?.feed ?? []).map((n: any) => {
    const ts = (n.ticker_sentiment ?? []).find((t: any) => t.ticker?.toUpperCase() === symbol.toUpperCase());
    const tp: string = n.time_published ?? '';
    const iso = tp.length >= 15 ? `${tp.slice(0, 4)}-${tp.slice(4, 6)}-${tp.slice(6, 8)}T${tp.slice(9, 11)}:${tp.slice(11, 13)}:${tp.slice(13, 15)}Z` : tp;
    return {
      title: n.title,
      url: n.url,
      source: n.source,
      publishedAt: iso,
      summary: n.summary,
      sentiment: ts ? Number(ts.ticker_sentiment_score) : num(n.overall_sentiment_score),
      sentimentLabel: ts?.ticker_sentiment_label ?? n.overall_sentiment_label ?? null,
    };
  });
}

export const alphaVantage: MarketDataProvider & { news(symbol: string): Promise<NewsItem[]> } = {
  name: 'Alpha Vantage',
  async bars(symbol, years) {
    // "full" history may require a premium key on some plans; compact = last 100 bars.
    const json = await call({ function: 'TIME_SERIES_DAILY', symbol: avSymbol(symbol), outputsize: years > 0.4 ? 'full' : 'compact' });
    const bars = parseDaily(json);
    const cutoff = Date.now() / 1000 - years * 366 * 86_400;
    return bars.filter((b) => b.t >= cutoff);
  },
  async quote(symbol) {
    const j = await call({ function: 'GLOBAL_QUOTE', symbol: avSymbol(symbol) });
    const g = j['Global Quote'];
    if (!g?.['05. price']) throw new ProviderError(P, `no quote for ${symbol}`);
    const price = Number(g['05. price']);
    const prev = num(g['08. previous close']);
    return {
      symbol,
      price,
      prevClose: prev,
      changePct: prev ? price / prev - 1 : null,
      currency: null,
      asOf: g['07. latest trading day'] ? `${g['07. latest trading day']}T20:00:00Z` : null,
    } satisfies Quote;
  },
  async fundamentals(symbol) {
    return parseOverview(await call({ function: 'OVERVIEW', symbol: avSymbol(symbol) }));
  },
  async news(symbol) {
    return parseNews(await call({ function: 'NEWS_SENTIMENT', tickers: symbol, limit: '20', sort: 'LATEST' }), symbol);
  },
};
