import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { isTradingDay, lastCompletedSession } from '../src/lib/marketHours.js';

/** Builds a response in Yahoo's v8 chart shape (test fixture — mirrors the real payload layout). */
export function yahooChart(symbol: string, closes: (number | null)[], lastDate: string, opts: { prevClose?: number; currency?: string; market?: 'US' | 'CA' } = {}) {
  const dates: string[] = [];
  let d = new Date(`${lastDate}T12:00:00Z`);
  while (dates.length < closes.length) {
    const iso = d.toISOString().slice(0, 10);
    if (isTradingDay(opts.market ?? 'US', iso)) dates.unshift(iso);
    d = new Date(d.getTime() - 86_400_000);
  }
  const timestamp = dates.map((x) => Date.parse(`${x}T13:30:00Z`) / 1000);
  const c = closes;
  const last = [...c].reverse().find((x) => x != null) as number;
  return {
    chart: {
      result: [
        {
          meta: {
            currency: opts.currency ?? 'USD',
            symbol,
            gmtoffset: -14400,
            regularMarketPrice: last,
            chartPreviousClose: opts.prevClose ?? (c.length > 1 ? c[c.length - 2] : last),
            regularMarketTime: timestamp[timestamp.length - 1] + 6 * 3600,
          },
          timestamp,
          indicators: {
            quote: [
              {
                open: c.map((x, i) => (x == null ? null : i ? (c[i - 1] ?? x) : x)),
                high: c.map((x) => (x == null ? null : x * 1.01)),
                low: c.map((x) => (x == null ? null : x * 0.99)),
                close: [...c],
                volume: c.map((x, i) => (x == null ? null : 1_000_000 + (i % 7) * 50_000)),
              },
            ],
          },
        },
      ],
      error: null,
    },
  };
}

export const fixture = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * Stubs global fetch with a tiny router so integration tests never touch the network.
 * `state.offline = true` makes every request fail (to exercise stale-data fallbacks).
 */
export function stubNetwork(prices: Record<string, number[]>) {
  const state = { offline: false, calls: [] as string[] };
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    state.calls.push(url);
    if (state.offline) throw new TypeError('fetch failed (offline)');
    const chart = url.match(/\/v8\/finance\/chart\/([^?]+)\?range=([^&]+)/);
    if (chart) {
      const sym = decodeURIComponent(chart[1]);
      const series = prices[sym];
      if (!series) return json({ chart: { result: null, error: { code: 'Not Found', description: 'No data found, symbol may be delisted' } } }, 404);
      const market = /\.(TO|V)$/.test(sym) ? 'CA' : 'US';
      return json(yahooChart(sym, chart[2] === '1d' ? series.slice(-2) : series, lastCompletedSession(market), { currency: market === 'CA' ? 'CAD' : 'USD', market }));
    }
    if (url.startsWith('https://fc.yahoo.com')) return new Response('', { status: 404, headers: { 'set-cookie': 'A3=abc; Domain=.yahoo.com' } });
    if (url.includes('/v1/test/getcrumb')) return new Response('crumb123');
    if (url.includes('/v10/finance/quoteSummary/')) return new Response(fixture('quoteSummary.json'), { headers: { 'content-type': 'application/json' } });
    if (url.includes('/v1/finance/search')) return json({ quotes: [], news: [{ title: 'Headline', link: 'https://news.example/a', publisher: 'Wire', providerPublishTime: 1760000000 }] });
    if (url === 'https://www.sec.gov/files/company_tickers.json') return json({ 0: { cik_str: 12345, ticker: 'EXMP', title: 'EXAMPLE CORP' } });
    if (url.startsWith('https://data.sec.gov/submissions/CIK0000012345.json'))
      return json({
        name: 'EXAMPLE CORP',
        filings: {
          recent: {
            accessionNumber: ['0001111111-26-000001', '0000950123-26-000002'],
            form: ['4', 'SCHEDULE 13G'],
            filingDate: [new Date().toISOString().slice(0, 10), '2026-02-10'],
            reportDate: ['', ''],
            primaryDocument: ['xslF345X05/form4.xml', 'doc.xml'],
          },
        },
      });
    if (url.endsWith('/form4.xml')) return new Response(fixture('form4.xml').replace(/2026-08-1[23]/g, new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10)));
    void init;
    throw new TypeError(`unexpected request in test: ${url}`);
  });
  return state;
}

/** Deterministic price path for fixtures. */
export const path = (n: number, start: number, drift: number, amp = 0.02) =>
  Array.from({ length: n }, (_, i) => +(start * (1 + drift) ** i * (1 + amp * Math.sin(i / 3))).toFixed(4));
