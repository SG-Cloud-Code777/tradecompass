import cron from 'node-cron';
import { one, q } from '../db/pool.js';
import { mapLimit } from '../lib/http.js';
import { marketStatus } from '../lib/marketHours.js';
import { evaluatePriceAlerts } from '../services/alerts.js';
import { getFundamentals } from '../services/fundamentals.js';
import { checkPaperStops } from '../services/paper.js';
import { getQuote } from '../services/prices.js';
import { computeSignal } from '../services/signals.js';
import { refreshFund, refreshInsiders } from '../services/smartMoney.js';

export type JobName = 'quotes' | 'signals' | 'fundamentals' | 'insiders' | 'funds';

/** Everything the user cares about: the universe plus watchlist, holdings, paper positions and alert symbols. */
async function trackedSymbols(market?: 'US' | 'CA') {
  const rows = await q<{ symbol: string }>(
    `select symbol from securities where in_universe and ($1::text is null or market = $1)
     union select symbol from watchlist union select symbol from holdings
     union select symbol from paper_positions union select symbol from alert_rules where symbol is not null`,
    [market ?? null],
  );
  return rows.map((r) => r.symbol);
}

const JOBS: Record<JobName, () => Promise<string>> = {
  async quotes() {
    const markets = (['US', 'CA'] as const).filter((m) => marketStatus(m).open);
    if (!markets.length) return 'markets closed';
    const symbols = (await Promise.all(markets.map((m) => trackedSymbols(m)))).flat();
    const res = await mapLimit([...new Set(symbols)], 6, async (s) => {
      const qt = await getQuote(s, { force: true });
      if (!qt.meta.stale) await evaluatePriceAlerts(s, qt.price);
    });
    await checkPaperStops();
    return `${res.filter((r) => r.ok).length}/${res.length} quotes`;
  },
  async signals() {
    const symbols = await trackedSymbols();
    const res = await mapLimit(symbols, 3, (s) => computeSignal(s, { force: true }));
    return `${res.filter((r) => r.ok).length}/${res.length} signals`;
  },
  async fundamentals() {
    const symbols = await trackedSymbols();
    const res = await mapLimit(symbols, 3, (s) => getFundamentals(s, { force: true }));
    return `${res.filter((r) => r.ok && !r.value.meta.stale).length}/${res.length} fundamentals`;
  },
  async insiders() {
    const rows = await q<{ symbol: string }>(`select symbol from securities where market = 'US' and kind <> 'etf'
                                              union select symbol from watchlist where symbol !~ '\\.'`);
    const res = await mapLimit(rows, 2, (r) => refreshInsiders(r.symbol, true));
    return `${res.filter((r) => r.ok).length}/${res.length} issuers`;
  },
  async funds() {
    const funds = await q<{ id: number }>(`select id from funds where tracked and cik is not null`);
    const res = await mapLimit(funds, 1, (f) => refreshFund(f.id));
    const added = res.reduce((a, r) => a + (r.ok ? r.value.newFilings : 0), 0);
    return `${res.filter((r) => r.ok).length}/${res.length} funds, ${added} new filings${res.some((r) => !r.ok) ? `; errors: ${res.filter((r) => !r.ok).map((r) => (r as any).error).join('; ').slice(0, 300)}` : ''}`;
  },
};

const running = new Set<JobName>();

export async function runJob(job: JobName) {
  if (running.has(job)) return { job, skipped: 'already running' };
  running.add(job);
  const run = await one<{ id: number }>(`insert into job_runs (job) values ($1) returning id`, [job]);
  try {
    const detail = await JOBS[job]();
    await q(`update job_runs set finished_at = now(), ok = true, detail = $2 where id = $1`, [run!.id, detail]);
    return { job, ok: true, detail };
  } catch (e) {
    await q(`update job_runs set finished_at = now(), ok = false, detail = $2 where id = $1`, [run!.id, (e as Error).message]);
    return { job, ok: false, detail: (e as Error).message };
  } finally {
    running.delete(job);
  }
}

/** All times America/New_York (both NYSE and TSX run 9:30–16:00 ET). */
export function startScheduler(log: (msg: string) => void) {
  const tz = { timezone: 'America/New_York' };
  const go = (job: JobName) => () => void runJob(job).then((r) => log(`[job] ${job}: ${JSON.stringify(r)}`));
  cron.schedule('*/15 9-16 * * 1-5', go('quotes'), tz); // intraday quotes + price alerts + paper stops
  cron.schedule('20 17 * * 1-5', go('signals'), tz); // after the close: bars, signals, signal-change alerts
  cron.schedule('0 6 * * 1-5', go('fundamentals'), tz); // fundamentals, earnings & ex-dividend dates
  cron.schedule('30 6 * * 1-5', go('insiders'), tz); // SEC Form 4
  cron.schedule('0 7 * * *', go('funds'), tz); // 13F (new filings cluster around 45 days after quarter end)
  log('[jobs] scheduler started');
}
