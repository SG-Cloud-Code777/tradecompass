import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { SECTOR_ORDER, SECTORS, type Market, type SectorId } from '@tradecompass/signals';
import Fastify, { type FastifyError } from 'fastify';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { DEFAULT_USER_ID, one, q } from './db/pool.js';
import { marketStatus } from './lib/marketHours.js';
import { yahoo } from './providers/yahoo.js';
import { pushInfo } from './services/alerts.js';
import { converter } from './services/fx.js';
import { COMMODITIES, macroSeries } from './services/macro.js';
import { newsFor } from './services/news.js';
import { checkPaperStops, paperState, placeOrder, resetPaper } from './services/paper.js';
import { addHolding, ACCOUNTS, portfolio, riskDashboard, settings } from './services/portfolio.js';
import { getBars, getQuote, getQuotes } from './services/prices.js';
import { heatmap, sectorView } from './services/sectors.js';
import { ensureSecurity, normalizeSymbol } from './services/securities.js';
import { getSignal, signalHistory, topSignals } from './services/signals.js';
import { fundDetail, insiderClusters, listFunds, refreshFund, smartMoneyForSymbol } from './services/smartMoney.js';
import { runJob } from './jobs/scheduler.js';

const MarketQ = z.object({ market: z.enum(['US', 'CA']).default('US') });
const Sym = z.object({ symbol: z.string().min(1).max(20).regex(/^[A-Za-z0-9.\-=^]+$/) });
const Id = z.object({ id: z.coerce.number().int().positive() });

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' ? { level: 'info' } : false });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err: FastifyError | ZodError, _req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: 'Invalid request', issues: err.issues });
    const status = (err as any).statusCode ?? 500;
    if (status >= 500 && status !== 503) app.log.error(err);
    return reply.status(status).send({
      error: status === 503 ? 'Data unavailable' : (err as Error).message,
      detail: status === 503 ? (err as Error).message : undefined,
    });
  });

  // ------------------------------------------------------------- market & data
  app.get('/api/health', async () => ({ ok: true, db: !!(await one('select 1 as ok')) }));

  app.get('/api/market/status', async () => ({ US: marketStatus('US'), CA: marketStatus('CA') }));

  app.get('/api/sectors', async () => SECTOR_ORDER.map((id) => SECTORS[id]));

  app.get('/api/home', async (req) => {
    const { market } = MarketQ.parse(req.query);
    const [top, heat, commodities] = await Promise.all([
      topSignals(market),
      heatmap(market),
      getQuotes(COMMODITIES.map((c) => c.symbol)),
    ]);
    return {
      market,
      status: marketStatus(market),
      top,
      heatmap: heat,
      commodities: COMMODITIES.map((c) => {
        const qt = commodities.quotes.get(c.symbol);
        return { ...c, price: qt?.price ?? null, changePct: qt?.changePct ?? null, meta: qt?.meta ?? null, error: commodities.errors[c.symbol] ?? null };
      }),
    };
  });

  app.get('/api/sectors/:sector', async (req) => {
    const { sector } = z.object({ sector: z.enum(SECTOR_ORDER as [SectorId, ...SectorId[]]) }).parse(req.params);
    const { market } = MarketQ.parse(req.query);
    return sectorView(market, sector, { computeMissing: 8 });
  });

  app.get('/api/macro', async (req) => {
    const { sector } = z.object({ sector: z.string().optional() }).parse(req.query);
    return macroSeries(sector as SectorId | undefined);
  });

  app.get('/api/search', async (req) => {
    const { q: query, market } = z.object({ q: z.string().min(1).max(40), market: z.enum(['US', 'CA']).optional() }).parse(req.query);
    const { hits } = await yahoo.search(query);
    const isCA = (s: string) => /\.(TO|V)$/.test(s);
    return hits.filter((h) => !market || (market === 'CA' ? isCA(h.symbol) : !h.symbol.includes('.')));
  });

  app.get('/api/quote/:symbol', async (req) => getQuote(normalizeSymbol(Sym.parse(req.params).symbol)));

  app.get('/api/bars/:symbol', async (req) => {
    const symbol = normalizeSymbol(Sym.parse(req.params).symbol);
    const { days } = z.object({ days: z.coerce.number().int().min(30).max(1900).default(400) }).parse(req.query);
    const { bars, meta } = await getBars(symbol);
    return { symbol, bars: bars.slice(-days), meta };
  });

  app.get('/api/fx', async () => converter());

  app.get('/api/news/:symbol', async (req) => newsFor(normalizeSymbol(Sym.parse(req.params).symbol)));

  // ------------------------------------------------------------- signals
  app.get('/api/signal/:symbol', async (req) => {
    const symbol = normalizeSymbol(Sym.parse(req.params).symbol);
    const { refresh } = z.object({ refresh: z.coerce.boolean().default(false) }).parse(req.query);
    return getSignal(symbol, { force: refresh });
  });
  app.get('/api/signal/:symbol/history', async (req) => signalHistory(normalizeSymbol(Sym.parse(req.params).symbol)));

  // ------------------------------------------------------------- smart money
  app.get('/api/smart-money/stock/:symbol', async (req) => {
    const symbol = normalizeSymbol(Sym.parse(req.params).symbol);
    const sec = await ensureSecurity(symbol);
    return smartMoneyForSymbol(symbol, sec.name);
  });
  app.get('/api/smart-money/funds', async () => listFunds());
  app.get('/api/smart-money/funds/:id', async (req, reply) => {
    const d = await fundDetail(Id.parse(req.params).id);
    return d ?? reply.status(404).send({ error: 'Fund not found' });
  });
  app.post('/api/smart-money/funds', async (req) => {
    const b = z.object({ name: z.string().min(2).max(120), cik: z.string().regex(/^\d{1,10}$/), country: z.enum(['US', 'CA']).default('US') }).parse(req.body);
    return one(
      `insert into funds (name, cik, country, tracked) values ($1, lpad($2, 10, '0'), $3, true)
       on conflict (cik) do update set tracked = true returning *`,
      [b.name, b.cik, b.country],
    );
  });
  app.post('/api/smart-money/funds/:id/follow', async (req) => {
    const { id } = Id.parse(req.params);
    const { follow } = z.object({ follow: z.boolean() }).parse(req.body);
    await q(`update funds set followed = $2, tracked = tracked or $2 where id = $1`, [id, follow]);
    if (follow)
      await q(
        `insert into alert_rules (user_id, kind, fund_id) select $1, 'fund_filing', $2 where not exists
         (select 1 from alert_rules where user_id = $1 and kind = 'fund_filing' and fund_id = $2)`,
        [DEFAULT_USER_ID, id],
      );
    else await q(`delete from alert_rules where user_id = $1 and kind = 'fund_filing' and fund_id = $2`, [DEFAULT_USER_ID, id]);
    return { ok: true };
  });
  app.post('/api/smart-money/funds/:id/refresh', async (req) => refreshFund(Id.parse(req.params).id));
  app.get('/api/smart-money/insider-clusters', async (req) => insiderClusters(MarketQ.parse(req.query).market));

  // ------------------------------------------------------------- settings
  app.get('/api/settings', async () => ({ ...(await settings()), accounts: ACCOUNTS, push: pushInfo() }));
  app.put('/api/settings', async (req) => {
    const b = z.object({ baseCurrency: z.enum(['CAD', 'USD']).optional(), riskPct: z.number().min(0.0025).max(0.05).optional() }).parse(req.body);
    await q(`update users set base_currency = coalesce($2, base_currency), risk_pct = coalesce($3, risk_pct) where id = $1`, [
      DEFAULT_USER_ID,
      b.baseCurrency ?? null,
      b.riskPct ?? null,
    ]);
    return settings();
  });

  // ------------------------------------------------------------- portfolio & watchlist
  app.get('/api/portfolio', async () => portfolio());
  app.get('/api/portfolio/risk', async () => riskDashboard());
  app.post('/api/portfolio/holdings', async (req) => {
    const b = z
      .object({
        symbol: z.string().min(1).max(20),
        shares: z.number().positive(),
        cost: z.number().min(0),
        currency: z.enum(['CAD', 'USD']).optional(),
        account: z.enum(ACCOUNTS).optional(),
        openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        notes: z.string().max(500).optional(),
      })
      .parse(req.body);
    return addHolding(b);
  });
  app.delete('/api/portfolio/holdings/:id', async (req) => {
    await q(`delete from holdings where id = $1 and user_id = $2`, [Id.parse(req.params).id, DEFAULT_USER_ID]);
    return { ok: true };
  });

  app.get('/api/watchlist', async () => {
    const rows = await q<{ symbol: string; name: string; market: Market; score: number | null; label: string | null }>(
      `select w.symbol, s.name, s.market, g.score, g.label from watchlist w left join securities s on s.symbol = w.symbol
       left join signals g on g.symbol = w.symbol where w.user_id = $1 order by w.added_at desc`,
      [DEFAULT_USER_ID],
    );
    const { quotes } = await getQuotes(rows.map((r) => r.symbol));
    return rows.map((r) => ({ ...r, price: quotes.get(r.symbol)?.price ?? null, changePct: quotes.get(r.symbol)?.changePct ?? null }));
  });
  app.post('/api/watchlist', async (req) => {
    const { symbol } = Sym.parse(req.body);
    const sec = await ensureSecurity(symbol);
    await q(`insert into watchlist (user_id, symbol) values ($1, $2) on conflict do nothing`, [DEFAULT_USER_ID, sec.symbol]);
    // default alert: tell me when the signal changes
    await q(
      `insert into alert_rules (user_id, kind, symbol) select $1, 'signal_change', $2 where not exists
       (select 1 from alert_rules where user_id = $1 and kind = 'signal_change' and symbol = $2)`,
      [DEFAULT_USER_ID, sec.symbol],
    );
    return { ok: true };
  });
  app.delete('/api/watchlist/:symbol', async (req) => {
    await q(`delete from watchlist where user_id = $1 and symbol = $2`, [DEFAULT_USER_ID, normalizeSymbol(Sym.parse(req.params).symbol)]);
    return { ok: true };
  });

  // ------------------------------------------------------------- alerts
  app.get('/api/alerts/rules', async () =>
    q(
      `select r.*, f.name fund_name from alert_rules r left join funds f on f.id = r.fund_id where r.user_id = $1 order by r.created_at desc`,
      [DEFAULT_USER_ID],
    ),
  );
  app.post('/api/alerts/rules', async (req) => {
    const b = z
      .object({
        kind: z.enum(['price_above', 'price_below', 'signal_change', 'earnings', 'ex_dividend', 'fund_filing']),
        symbol: z.string().max(20).optional(),
        fundId: z.number().int().optional(),
        threshold: z.number().positive().optional(),
      })
      .refine((b) => (b.kind.startsWith('price') ? b.threshold != null && b.symbol : true), 'Price alerts need a symbol and threshold')
      .refine((b) => (b.kind === 'fund_filing' ? b.fundId != null : !!b.symbol), 'Missing symbol or fund')
      .parse(req.body);
    const symbol = b.symbol ? (await ensureSecurity(b.symbol)).symbol : null;
    return one(`insert into alert_rules (user_id, kind, symbol, fund_id, threshold) values ($1,$2,$3,$4,$5) returning *`, [
      DEFAULT_USER_ID,
      b.kind,
      symbol,
      b.fundId ?? null,
      b.threshold ?? null,
    ]);
  });
  app.delete('/api/alerts/rules/:id', async (req) => {
    await q(`delete from alert_rules where id = $1 and user_id = $2`, [Id.parse(req.params).id, DEFAULT_USER_ID]);
    return { ok: true };
  });
  app.get('/api/alerts/events', async () => q(`select * from alert_events where user_id = $1 order by created_at desc limit 100`, [DEFAULT_USER_ID]));
  app.post('/api/alerts/events/read', async () => {
    await q(`update alert_events set read = true where user_id = $1`, [DEFAULT_USER_ID]);
    return { ok: true };
  });
  app.get('/api/push/vapid', async () => pushInfo());
  app.post('/api/push/subscribe', async (req) => {
    const b = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(req.body);
    await q(`insert into push_subscriptions (user_id, endpoint, keys) values ($1,$2,$3) on conflict (endpoint) do update set keys = excluded.keys`, [
      DEFAULT_USER_ID,
      b.endpoint,
      JSON.stringify(b.keys),
    ]);
    return { ok: true };
  });

  // ------------------------------------------------------------- paper trading
  app.get('/api/paper', async (req) => {
    const { market } = MarketQ.parse(req.query);
    await checkPaperStops().catch(() => undefined);
    return paperState(market);
  });
  app.post('/api/paper/order', async (req) => {
    const b = z
      .object({
        symbol: z.string().min(1).max(20),
        side: z.enum(['buy', 'sell']),
        shares: z.number().positive(),
        stop: z.number().positive().nullable().optional(),
        target: z.number().positive().nullable().optional(),
        signalLabel: z.string().max(20).nullable().optional(),
      })
      .parse(req.body);
    return placeOrder(b);
  });
  app.post('/api/paper/reset', async (req) => resetPaper(MarketQ.parse(req.body ?? {}).market));

  // ------------------------------------------------------------- admin
  app.post('/api/admin/jobs/:job', async (req) => {
    const { job } = z.object({ job: z.enum(['quotes', 'signals', 'fundamentals', 'insiders', 'funds']) }).parse(req.params);
    return runJob(job);
  });
  app.get('/api/admin/jobs', async () => q(`select * from job_runs order by started_at desc limit 30`));

  // ------------------------------------------------------------- static web build (production)
  const webDist = fileURLToPath(new URL('../../web/dist', import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.status(404).send({ error: 'Not found' }) : reply.sendFile('index.html')));
  }
  return app;
}
