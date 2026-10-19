import { config } from '../config.js';
import { cached } from '../lib/cache.js';
import { alphaVantage, avSymbol } from '../providers/alphaVantage.js';
import type { NewsItem } from '../providers/types.js';
import { yahoo } from '../providers/yahoo.js';

/** Headlines with sentiment (Alpha Vantage) when a key is configured; otherwise Yahoo headlines without sentiment. */
export async function newsFor(symbol: string) {
  return cached<NewsItem[]>(`news:${symbol}`, config.ttl.newsSec, async () => {
    if (config.alphaVantageKey) {
      try {
        const items = await alphaVantage.news(avSymbol(symbol));
        if (items.length) return { data: items.slice(0, 15), source: 'Alpha Vantage News & Sentiment' };
      } catch {
        // fall through to Yahoo
      }
    }
    const { news } = await yahoo.search(symbol);
    return { data: news.slice(0, 15), source: 'Yahoo Finance (no sentiment)' };
  });
}
