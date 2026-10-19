import type { Bar } from '@tradecompass/signals';
import { getJson, httpGet, ProviderError } from '../lib/http.js';
import type { FundamentalsData, MarketDataProvider, NewsItem, Quote, SearchHit } from './types.js';

/**
 * Yahoo Finance-compatible public endpoints. Unofficial: no SLA, may change, personal/educational use.
 * Swap MARKET_DATA_PROVIDERS to a licensed vendor (Polygon, Twelve Data, ...) for production.
 */
const BASE = 'https://query2.finance.yahoo.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; TradeCompass/0.1)' };
const P = 'yahoo';

export function parseChart(json: any): { bars: Bar[]; meta: any } {
  const r = json?.chart?.result?.[0];
  if (!r) throw new ProviderError(P, json?.chart?.error?.description ?? 'empty chart response');
  const ts: number[] = r.timestamp ?? [];
  const qd = r.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = qd.open?.[i];
    const h = qd.high?.[i];
    const l = qd.low?.[i];
    const c = qd.close?.[i];
    if (o == null || h == null || l == null || c == null) continue; // Yahoo emits nulls on halted/partial days
    // Normalise to the session date at 00:00 UTC using the exchange's gmtoffset.
    const local = new Date((ts[i] + (r.meta?.gmtoffset ?? 0)) * 1000);
    const t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) / 1000;
    if (bars.length && bars[bars.length - 1].t === t) bars.pop(); // live bar duplicate
    bars.push({ t, o, h, l, c, v: qd.volume?.[i] ?? 0 });
  }
  return { bars, meta: r.meta };
}

export function parseQuoteFromChart(symbol: string, json: any): Quote {
  const { meta } = parseChart(json);
  const price = meta.regularMarketPrice;
  if (typeof price !== 'number') throw new ProviderError(P, `no price for ${symbol}`);
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
  return {
    symbol,
    price,
    prevClose: prev,
    changePct: prev ? price / prev - 1 : null,
    currency: meta.currency ?? null,
    asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
  };
}

const raw = (x: any): number | null => (x && typeof x === 'object' ? (x.raw ?? null) : typeof x === 'number' ? x : null);
const dateOf = (x: any) => {
  const v = raw(x);
  return v ? new Date(v * 1000).toISOString().slice(0, 10) : null;
};

export function parseQuoteSummary(json: any): FundamentalsData {
  const r = json?.quoteSummary?.result?.[0];
  if (!r) throw new ProviderError(P, json?.quoteSummary?.error?.description ?? 'empty quoteSummary');
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const fd = r.financialData ?? {};
  const ap = r.assetProfile ?? {};
  const pr = r.price ?? {};
  const ce = r.calendarEvents ?? {};
  const de = raw(fd.debtToEquity);
  const quoteType = pr.quoteType ?? null;
  const industry: string | null = ap.industry ?? null;
  const upcoming = (ce.earnings?.earningsDate ?? []).map(dateOf).filter(Boolean) as string[];
  return {
    pe: raw(sd.trailingPE) ?? null,
    epsGrowth: raw(fd.earningsGrowth),
    revenueGrowth: raw(fd.revenueGrowth),
    debtToEquity: de != null ? de / 100 : null, // Yahoo reports D/E in percent
    freeCashFlow: raw(fd.freeCashflow),
    dividendYield: raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield),
    payoutRatio: raw(sd.payoutRatio),
    priceToBook: raw(ks.priceToBook),
    isEtf: quoteType === 'ETF' || quoteType === 'MUTUALFUND',
    isReit: industry ? /REIT/i.test(industry) : undefined,
    sector: ap.sector ?? null,
    industry,
    marketCap: raw(pr.marketCap) ?? raw(sd.marketCap),
    earningsDate: upcoming[0] ?? null,
    exDividendDate: dateOf(sd.exDividendDate) ?? dateOf(ce.exDividendDate),
    quoteType,
  };
}

export function parseSearch(json: any): { hits: SearchHit[]; news: NewsItem[] } {
  const hits: SearchHit[] = (json?.quotes ?? [])
    .filter((x: any) => x.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
    .map((x: any) => ({
      symbol: x.symbol,
      name: x.longname ?? x.shortname ?? x.symbol,
      exchange: x.exchDisp ?? x.exchange ?? '',
      type: x.quoteType,
    }));
  const news: NewsItem[] = (json?.news ?? []).map((n: any) => ({
    title: n.title,
    url: n.link,
    source: n.publisher ?? 'Yahoo Finance',
    publishedAt: new Date((n.providerPublishTime ?? 0) * 1000).toISOString(),
    sentiment: null,
    sentimentLabel: null,
  }));
  return { hits, news };
}

// Yahoo's quoteSummary needs a session cookie + crumb.
let session: { cookie: string; crumb: string; at: number } | null = null;
async function getSession(force = false) {
  if (session && !force && Date.now() - session.at < 30 * 60_000) return session;
  const res = await fetch('https://fc.yahoo.com', { headers: UA, redirect: 'manual' }).catch((e) => {
    throw new ProviderError(P, `cookie request failed: ${e.message}`);
  });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (!cookie) throw new ProviderError(P, 'no session cookie');
  const crumb = await (await httpGet(`${BASE}/v1/test/getcrumb`, { provider: P, headers: { ...UA, Cookie: cookie } })).text();
  session = { cookie, crumb, at: Date.now() };
  return session;
}

export const yahoo: MarketDataProvider & {
  search(q: string): Promise<{ hits: SearchHit[]; news: NewsItem[] }>;
} = {
  name: 'Yahoo Finance',
  async bars(symbol, years) {
    const range = years <= 1 ? '1y' : years <= 2 ? '2y' : years <= 5 ? '5y' : '10y';
    const json = await getJson(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`, {
      provider: P,
      headers: UA,
    });
    const { bars } = parseChart(json);
    if (!bars.length) throw new ProviderError(P, `no bars for ${symbol}`);
    return bars;
  },
  async quote(symbol) {
    const json = await getJson(`${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { provider: P, headers: UA });
    return parseQuoteFromChart(symbol, json);
  },
  async fundamentals(symbol) {
    const modules = 'summaryDetail,defaultKeyStatistics,financialData,assetProfile,price,calendarEvents';
    const run = async (s: { cookie: string; crumb: string }) =>
      getJson(
        `${BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(s.crumb)}`,
        { provider: P, headers: { ...UA, Cookie: s.cookie } },
      );
    let json;
    try {
      json = await run(await getSession());
    } catch (e) {
      if ((e as ProviderError).status !== 401) throw e;
      json = await run(await getSession(true));
    }
    return parseQuoteSummary(json);
  },
  async search(q) {
    const json = await getJson(`${BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=10`, {
      provider: P,
      headers: UA,
    });
    return parseSearch(json);
  },
};
