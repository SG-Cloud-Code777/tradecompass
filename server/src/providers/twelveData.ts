import type { Bar } from '@tradecompass/signals';
import { config } from '../config.js';
import { getJson, ProviderError } from '../lib/http.js';
import type { MarketDataProvider } from './types.js';

const P = 'twelvedata';
const BASE = 'https://api.twelvedata.com';

/** RY.TO -> {symbol: RY, exchange: TSX}; REI-UN.TO -> REI.UN */
export function tdSymbol(s: string): { symbol: string; exchange?: string } {
  const m = s.match(/^(.+)\.(TO|V)$/i);
  if (!m) return { symbol: s };
  return { symbol: m[1].replace(/-UN$/i, '.UN').replace(/-/g, '.'), exchange: m[2].toUpperCase() === 'TO' ? 'TSX' : 'TSXV' };
}

async function call(path: string, params: Record<string, string | undefined>) {
  if (!config.twelveDataKey) throw new ProviderError(P, 'TWELVEDATA_API_KEY not set');
  const qs = new URLSearchParams({ apikey: config.twelveDataKey });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const json = await getJson(`${BASE}/${path}?${qs}`, { provider: P });
  if (json?.status === 'error') throw new ProviderError(P, json.message ?? 'error');
  return json;
}

export function parseTimeSeries(json: any): Bar[] {
  return (json?.values ?? [])
    .map((v: any) => ({
      t: Date.parse(`${v.datetime.slice(0, 10)}T00:00:00Z`) / 1000,
      o: Number(v.open),
      h: Number(v.high),
      l: Number(v.low),
      c: Number(v.close),
      v: Number(v.volume ?? 0),
    }))
    .sort((a: Bar, b: Bar) => a.t - b.t);
}

export const twelveData: MarketDataProvider = {
  name: 'Twelve Data',
  async bars(symbol, years) {
    const json = await call('time_series', { ...tdSymbol(symbol), interval: '1day', outputsize: String(Math.min(5000, Math.ceil(years * 252) + 5)) });
    const bars = parseTimeSeries(json);
    if (!bars.length) throw new ProviderError(P, `no bars for ${symbol}`);
    return bars;
  },
  async quote(symbol) {
    const j = await call('quote', tdSymbol(symbol));
    const price = Number(j.close);
    const prev = j.previous_close != null ? Number(j.previous_close) : null;
    return {
      symbol,
      price,
      prevClose: prev,
      changePct: prev ? price / prev - 1 : null,
      currency: j.currency ?? null,
      asOf: j.timestamp ? new Date(j.timestamp * 1000).toISOString() : null,
    };
  },
};
