import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Minimal .env loader (avoids a dependency); real environment variables win.
for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]) {
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const env = (k: string, d = '') => process.env[k] ?? d;

export const config = {
  port: Number(env('PORT', '8787')),
  databaseUrl: env('DATABASE_URL', 'postgres://postgres@localhost:5432/tradecompass'),
  secUserAgent: env('SEC_USER_AGENT', 'TradeCompass contact@example.com'),
  providers: env('MARKET_DATA_PROVIDERS', 'yahoo,twelvedata,alphavantage')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  alphaVantageKey: env('ALPHAVANTAGE_API_KEY'),
  twelveDataKey: env('TWELVEDATA_API_KEY'),
  fmpKey: env('FMP_API_KEY'),
  openFigiKey: env('OPENFIGI_API_KEY'),
  vapid: {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    subject: env('VAPID_SUBJECT', 'mailto:admin@example.com'),
  },
  enableJobs: env('ENABLE_JOBS', 'true') === 'true',
  /** How long cached data is considered fresh before a refetch is attempted. */
  ttl: {
    quoteSec: 60,
    barsSec: 60 * 60,
    fundamentalsSec: 24 * 60 * 60,
    macroSec: 60 * 60,
    newsSec: 30 * 60,
    signalSec: 30 * 60,
    filingsSec: 12 * 60 * 60,
  },
  /** Data older than this is shown with a clear "stale" warning. */
  staleAfterSec: {
    quote: 30 * 60, // during market hours
    bars: 4 * 24 * 60 * 60,
  },
};
