import { config } from '../config.js';
import { one, q } from '../db/pool.js';
import { cached, DataUnavailableError } from '../lib/cache.js';
import { marketOf } from '../lib/marketHours.js';
import { CONGRESS_SOURCES, congressTrades } from '../providers/congress.js';
import { mapCusips } from '../providers/openFigi.js';
import {
  fetch13F,
  ownershipFilings,
  padCik,
  recentInsiderTrades,
  SEC_LINKS,
  submissions,
  thirteenFFilings,
  tickerToCik,
} from '../providers/secEdgar.js';
import { onFundFiling } from './alerts.js';

const DAY = 86_400_000;

/** Normalised issuer name for fuzzy matching 13F issuers to our securities ("BARRICK MINING CORP" -> "BARRICK MINING"). */
export function normName(s: string) {
  return s
    .toUpperCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(INC|CORP|CORPORATION|CO|LTD|LIMITED|PLC|HOLDINGS?|GROUP|COMPANY|THE|CLASS [A-Z]|CL [A-Z]|NEW|COM|SA|NV|AG|ADR|SPONSORED|ETF|TRUST)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ticker that a 13F/OpenFIGI record would carry for one of our symbols: RY.TO -> RY, TECK-B.TO -> TECK, REI-UN.TO -> REI. */
export const baseTicker = (symbol: string) => symbol.replace(/\.(TO|V)$/i, '').replace(/-UN$/i, '').split('-')[0];

async function cikFor(symbol: string): Promise<{ cik: string; title: string } | null> {
  if (marketOf(symbol) !== 'US') return null;
  const res = await cached('sec:tickers', 7 * 86_400, async () => {
    const map = await tickerToCik();
    return { data: Object.fromEntries(map), source: 'SEC EDGAR' };
  });
  return (res.data as Record<string, { cik: string; title: string }>)[symbol.toUpperCase().replace('.', '-')] ?? null;
}

// ------------------------------------------------------------------- insiders

export async function refreshInsiders(symbol: string, force = false) {
  const c = await cikFor(symbol);
  if (!c) return { refreshed: false, reason: 'No SEC CIK (non-US issuer or ETF)' };
  const res = await cached(
    `form4:${symbol}`,
    config.ttl.filingsSec,
    async () => {
      const trades = await recentInsiderTrades(c.cik);
      for (const t of trades) {
        await q(
          `insert into insider_trades (symbol, accession, insider, role, code, shares, price, txn_date, filed)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing`,
          [symbol, t.accession, t.insider, t.role, t.code, t.shares, t.price, t.date, t.filed],
        );
      }
      return { data: { count: trades.length }, source: 'SEC EDGAR Form 4' };
    },
    { force },
  );
  return { refreshed: true, meta: res.meta };
}

export async function insiderSummary(symbol: string) {
  const agg = await one<{ buyers: number; sellers: number; buy_value: number; sell_value: number }>(
    `select count(distinct insider) filter (where code = 'P') buyers,
            count(distinct insider) filter (where code = 'S') sellers,
            coalesce(sum(shares * price) filter (where code = 'P'), 0) buy_value,
            coalesce(sum(shares * price) filter (where code = 'S'), 0) sell_value
     from insider_trades where symbol = $1 and txn_date >= current_date - 90`,
    [symbol],
  );
  const trades = await q(
    `select insider, role, code, shares, price, txn_date, filed, accession from insider_trades
     where symbol = $1 order by txn_date desc, id desc limit 25`,
    [symbol],
  );
  return {
    buyers90d: Number(agg?.buyers ?? 0),
    sellers90d: Number(agg?.sellers ?? 0),
    buyValue90d: Number(agg?.buy_value ?? 0),
    sellValue90d: Number(agg?.sell_value ?? 0),
    cluster: Number(agg?.buyers ?? 0) >= 3,
    trades,
  };
}

/** Stocks where several different insiders bought on the open market recently. */
export async function insiderClusters(market: 'US' | 'CA', days = 90) {
  return q(
    `select t.symbol, s.name, count(distinct t.insider)::int buyers, sum(t.shares * coalesce(t.price, 0))::float8 value,
            max(t.txn_date) last_buy
     from insider_trades t left join securities s on s.symbol = t.symbol
     where t.code = 'P' and t.txn_date >= current_date - $2::int and coalesce(s.market, 'US') = $1
     group by t.symbol, s.name having count(distinct t.insider) >= 2
     order by buyers desc, value desc limit 20`,
    [market, days],
  );
}

// ------------------------------------------------------------------- 13F funds

export async function refreshFund(fundId: number) {
  const fund = await one<{ id: number; name: string; cik: string; followed: boolean }>(`select * from funds where id = $1`, [fundId]);
  if (!fund?.cik) throw new Error('Fund has no CIK');
  const { filings } = await submissions(fund.cik);
  const latest = thirteenFFilings(filings).slice(0, 2);
  let added = 0;
  for (const f of latest.reverse()) {
    if (await one(`select 1 from fund_filings where accession = $1`, [f.accession])) continue;
    const rows = await fetch13F(fund.cik, f);
    const total = rows.reduce((a, r) => a + r.valueUsd, 0);
    const filing = await one<{ id: number }>(
      `insert into fund_filings (fund_id, accession, form, period, filed, total_value) values ($1,$2,$3,$4,$5,$6) returning id`,
      [fund.id, f.accession, f.form, f.reportDate, f.filed, total],
    );
    const tickers = await resolveTickers(rows);
    await q(
      `insert into fund_holdings (filing_id, cusip, issuer, title_class, value_usd, shares, put_call, ticker)
       select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::bigint[], $6::bigint[], $7::text[], $8::text[])`,
      [
        filing!.id,
        rows.map((r) => r.cusip),
        rows.map((r) => r.issuer),
        rows.map((r) => r.titleClass),
        rows.map((r) => Math.round(r.valueUsd)),
        rows.map((r) => Math.round(r.shares)),
        rows.map((r) => r.putCall),
        rows.map((r) => tickers.get(r.cusip) ?? null),
      ],
    );
    added++;
    await onFundFiling(fund.id, fund.name, f.reportDate, f.accession);
  }
  // keep two quarters per fund
  await q(
    `delete from fund_filings where fund_id = $1 and id not in (select id from fund_filings where fund_id = $1 order by period desc nulls last, filed desc limit 2)`,
    [fund.id],
  );
  return { fund: fund.name, newFilings: added };
}

/** Map CUSIPs to tickers: previously-seen mappings, then name match against our universe, then OpenFIGI for the largest positions. */
async function resolveTickers(rows: { cusip: string; issuer: string; valueUsd: number }[]) {
  const out = new Map<string, string>();
  const known = await q<{ cusip: string; ticker: string }>(
    `select distinct on (cusip) cusip, ticker from fund_holdings where ticker is not null and cusip = any($1)`,
    [rows.map((r) => r.cusip)],
  );
  for (const k of known) out.set(k.cusip, k.ticker);
  const secs = await q<{ symbol: string; name: string }>(`select symbol, name from securities where market = 'US'`);
  const byName = new Map(secs.map((s) => [normName(s.name), s.symbol]));
  for (const r of rows) if (!out.has(r.cusip) && byName.has(normName(r.issuer))) out.set(r.cusip, byName.get(normName(r.issuer))!);
  const top = [...rows]
    .filter((r) => !out.has(r.cusip))
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 60)
    .map((r) => r.cusip);
  try {
    const figi = await mapCusips([...new Set(top)]);
    for (const [cusip, v] of figi) out.set(cusip, v.ticker);
  } catch {
    // OpenFIGI is best-effort; unresolved rows still show the issuer name
  }
  return out;
}

type Pos = { cusip: string; issuer: string; ticker: string | null; value: number; shares: number };

async function positions(filingId: number): Promise<Map<string, Pos>> {
  const rows = await q<Pos>(
    `select cusip, max(issuer) issuer, max(ticker) ticker, sum(value_usd)::float8 value, sum(shares)::float8 shares
     from fund_holdings where filing_id = $1 and put_call is null group by cusip`,
    [filingId],
  );
  return new Map(rows.map((r) => [r.cusip, r]));
}

export function diffPositions(cur: Map<string, Pos>, prev: Map<string, Pos> | null) {
  const changes: (Pos & { status: 'new' | 'added' | 'trimmed' | 'held' | 'exited'; sharesChangePct: number | null })[] = [];
  for (const p of cur.values()) {
    const old = prev?.get(p.cusip);
    if (!prev) changes.push({ ...p, status: 'held', sharesChangePct: null });
    else if (!old) changes.push({ ...p, status: 'new', sharesChangePct: null });
    else {
      const d = old.shares ? p.shares / old.shares - 1 : 0;
      changes.push({ ...p, status: d > 0.02 ? 'added' : d < -0.02 ? 'trimmed' : 'held', sharesChangePct: d });
    }
  }
  if (prev) for (const o of prev.values()) if (!cur.has(o.cusip)) changes.push({ ...o, value: 0, shares: 0, status: 'exited', sharesChangePct: -1 });
  return changes;
}

const delayInfo = (period: string | null, filed: string) => ({
  period,
  filed,
  filingLagDays: period ? Math.round((Date.parse(filed) - Date.parse(period)) / DAY) : null,
  dataAgeDays: period ? Math.round((Date.now() - Date.parse(period)) / DAY) : null,
  note: '13F filings are due 45 days after quarter end, show only US-listed long positions, and omit shorts, cash and most non-US holdings.',
});

export async function listFunds() {
  return q(
    `select f.*, lf.period, lf.filed, lf.total_value
     from funds f left join lateral (select period, filed, total_value from fund_filings where fund_id = f.id order by period desc nulls last limit 1) lf on true
     order by f.followed desc, f.tracked desc, f.name`,
  );
}

export async function fundDetail(fundId: number) {
  const fund = await one(`select * from funds where id = $1`, [fundId]);
  if (!fund) return null;
  const filings = await q<{ id: number; period: string | null; filed: string; total_value: number; accession: string }>(
    `select * from fund_filings where fund_id = $1 order by period desc nulls last, filed desc limit 2`,
    [fundId],
  );
  if (!filings.length) return { fund, filing: null, top: [], changes: null };
  const cur = await positions(filings[0].id);
  const prev = filings[1] ? await positions(filings[1].id) : null;
  const diff = diffPositions(cur, prev);
  const total = [...cur.values()].reduce((a, p) => a + p.value, 0) || 1;
  const withWeight = diff.map((d) => ({ ...d, weight: d.value / total }));
  const by = (s: string) => withWeight.filter((d) => d.status === s).sort((a, b) => b.value - a.value || a.issuer.localeCompare(b.issuer));
  return {
    fund,
    filing: { ...delayInfo(filings[0].period, filings[0].filed), accession: filings[0].accession, totalValue: filings[0].total_value, positions: cur.size, comparedTo: filings[1]?.period ?? null },
    top: withWeight.filter((d) => d.status !== 'exited').sort((a, b) => b.value - a.value).slice(0, 25),
    changes: prev
      ? {
          new: by('new').slice(0, 15),
          added: by('added').slice(0, 15),
          trimmed: by('trimmed').slice(0, 15),
          exited: prev ? [...by('exited')].sort((a, b) => (prev.get(b.cusip)?.value ?? 0) - (prev.get(a.cusip)?.value ?? 0)).slice(0, 15) : [],
        }
      : null,
  };
}

/** Which tracked funds hold / bought / sold this symbol in their latest 13F vs. the prior one. */
export async function fundsForSymbol(symbol: string, securityName?: string) {
  const ticker = baseTicker(symbol);
  const isCA = marketOf(symbol) === 'CA';
  const rows = await q<{ fund_id: number; fund: string; filing_id: number; period: string; filed: string; rank: number; issuer: string; value: number; shares: number }>(
    `with ranked as (
       select ff.*, row_number() over (partition by ff.fund_id order by ff.period desc nulls last, ff.filed desc) rank from fund_filings ff)
     select r.fund_id, f.name fund, r.id filing_id, r.period, r.filed, r.rank, max(h.issuer) issuer,
            sum(h.value_usd)::float8 value, sum(h.shares)::float8 shares
     from ranked r join funds f on f.id = r.fund_id join fund_holdings h on h.filing_id = r.id
     where r.rank <= 2 and h.ticker = $1 and h.put_call is null
     group by r.fund_id, f.name, r.id, r.period, r.filed, r.rank`,
    [ticker],
  );
  // Cross-listed Canadian names: guard against a different US company with the same ticker (T.TO TELUS vs T AT&T).
  const first = securityName ? normName(securityName).split(' ')[0] : null;
  const ok = (issuer: string) => !isCA || !first || normName(issuer).startsWith(first);
  const byFund = new Map<number, { fund: string; cur?: (typeof rows)[0]; prev?: (typeof rows)[0] }>();
  for (const r of rows.filter((r) => ok(r.issuer))) {
    const e = byFund.get(r.fund_id) ?? { fund: r.fund };
    if (r.rank === 1) e.cur = r;
    else e.prev = r;
    byFund.set(r.fund_id, e);
  }
  const hasPrev = new Map(
    (await q<{ fund_id: number; n: number }>(`select fund_id, count(*)::int n from fund_filings group by fund_id`)).map((r) => [r.fund_id, r.n >= 2]),
  );
  const list = [...byFund.entries()].map(([fundId, e]) => {
    const status = !e.cur ? 'exited' : !e.prev ? (hasPrev.get(fundId) ? 'new' : 'held') : e.cur.shares > e.prev.shares * 1.02 ? 'added' : e.cur.shares < e.prev.shares * 0.98 ? 'trimmed' : 'held';
    return {
      fundId,
      fund: e.fund,
      status,
      shares: e.cur?.shares ?? 0,
      value: e.cur?.value ?? 0,
      prevShares: e.prev?.shares ?? null,
      ...delayInfo((e.cur ?? e.prev)!.period, (e.cur ?? e.prev)!.filed),
    };
  });
  return {
    holders: list.sort((a, b) => b.value - a.value),
    adding: list.filter((l) => l.status === 'new' || l.status === 'added').length,
    trimming: list.filter((l) => l.status === 'trimmed' || l.status === 'exited').length,
  };
}

// ------------------------------------------------------------------- per-stock view

export async function smartMoneyForSymbol(symbol: string, securityName?: string) {
  const isCA = marketOf(symbol) === 'CA';
  const funds = await fundsForSymbol(symbol, securityName);
  const disclaimer =
    'Big-fund data is delayed (13F: up to 45 days after quarter end; Form 4: 2 business days; congressional reports: up to 45 days). Funds hedge, rebalance and make mistakes — copying them is not a guarantee.';
  if (isCA) {
    return {
      market: 'CA',
      funds,
      insiders: null,
      ownership: [],
      congress: null,
      canada: {
        note: 'Canadian insider reports are filed on SEDI within 5 calendar days of a trade; company filings (financials, early-warning reports for 10%+ stakes) are on SEDAR+. Neither offers a public API, so open them directly:',
        links: [
          { name: 'SEDI — insider transaction search', url: 'https://www.sedi.ca/' },
          { name: 'SEDAR+ — company filings search', url: 'https://www.sedarplus.ca/landingpage/' },
          { name: 'SEC EDGAR — US filings for interlisted issuers (40-F, 6-K)', url: SEC_LINKS.fullTextSearch(securityName ?? symbol) },
        ],
        pensionNote:
          'Canadian pension plans (CPP Investments, OMERS, OTPP, CDPQ) disclose US-listed holdings in SEC 13F filings and their full portfolios only in annual reports.',
      },
      disclaimer,
    };
  }
  let insiders = null;
  let insidersError: string | null = null;
  try {
    await refreshInsiders(symbol);
    insiders = await insiderSummary(symbol);
  } catch (e) {
    insidersError = (e as Error).message;
    insiders = await insiderSummary(symbol);
  }
  let ownership: { form: string; filed: string; url: string }[] = [];
  let ownershipError: string | null = null;
  const c = await cikFor(symbol).catch(() => null);
  if (c) {
    try {
      const res = await cached(`subs:${c.cik}`, config.ttl.filingsSec, async () => ({ data: (await submissions(c.cik)).filings.slice(0, 400), source: 'SEC EDGAR' }));
      ownership = ownershipFilings(res.data).map((f) => ({ form: f.form, filed: f.filed, url: f.url }));
    } catch (e) {
      ownershipError = (e as Error).message;
    }
  }
  let congress: Awaited<ReturnType<typeof congressTrades>> & { sources: typeof CONGRESS_SOURCES; error?: string };
  try {
    const res = await cached(`congress:${symbol}`, config.ttl.filingsSec, async () => ({ data: await congressTrades(symbol), source: 'FMP' }));
    congress = { ...res.data, sources: CONGRESS_SOURCES };
  } catch (e) {
    congress = { available: false, trades: [], sources: CONGRESS_SOURCES, error: e instanceof DataUnavailableError ? e.message : String(e) };
  }
  return {
    market: 'US',
    funds,
    insiders: { ...insiders, error: insidersError, cik: c ? padCik(c.cik) : null, edgarUrl: c ? SEC_LINKS.edgarCompany(c.cik) : null },
    ownership,
    ownershipError,
    congress,
    disclaimer,
  };
}
