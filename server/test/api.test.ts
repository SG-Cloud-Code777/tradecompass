import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool, q } from '../src/db/pool.js';
import { seed } from '../src/db/seed.js';
import { path, stubNetwork } from './helpers.js';

let app: FastifyInstance;
let net: ReturnType<typeof stubNetwork>;

beforeAll(async () => {
  await pool.query('drop schema public cascade; create schema public;');
  await seed();
  // Only these symbols "exist" upstream; everything else 404s like a delisted ticker.
  net = stubNetwork({
    EXMP: path(600, 20, 0.002),
    DOWN: path(600, 80, -0.002),
    '^TNX': path(300, 4.2, -0.0005, 0.001),
    'DX-Y.NYB': path(300, 104, -0.0003, 0.002),
    TIP: path(300, 108, 0.0001, 0.002),
    IEF: path(300, 95, 0, 0.002),
    'GC=F': path(300, 2400, 0.002, 0.01),
    'CADUSD=X': path(300, 0.73, 0, 0.002),
    'RY.TO': path(600, 140, 0.001),
  });
  await q(`insert into securities (symbol, name, market, exchange, currency, sector, kind) values
           ('EXMP','Example Corp','US','NYSE','USD','gold','stock'), ('DOWN','Downtrend Inc','US','NYSE','USD','semis','stock')`);
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(() => {
  net.offline = false;
});

describe('market data & caching', () => {
  it('reports market status for both exchanges', async () => {
    const r = await app.inject('/api/market/status');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveProperty('US.session');
    expect(r.json()).toHaveProperty('CA.session');
  });

  it('serves quotes with provenance in native currency', async () => {
    const r = (await app.inject('/api/quote/RY.TO')).json();
    expect(r.currency).toBe('CAD');
    expect(r.meta.source).toBe('Yahoo Finance');
    expect(r.meta.stale).toBe(false);
  });

  it('falls back to cached bars flagged stale when the provider is down', async () => {
    await app.inject('/api/bars/EXMP');
    await q(`update api_cache set fetched_at = now() - interval '1 day' where key = 'bars:EXMP'`);
    net.offline = true;
    const r = (await app.inject('/api/bars/EXMP?days=60')).json();
    expect(r.bars).toHaveLength(60);
    expect(r.meta.stale).toBe(true);
    expect(r.meta.error).toMatch(/offline/);
  });

  it('returns a clear 503 when there is no data at all', async () => {
    const r = await app.inject('/api/bars/NOPE');
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toBe('Data unavailable');
  });

  it('rejects malformed symbols', async () => {
    expect((await app.inject('/api/quote/%3Cscript%3E')).statusCode).toBe(400);
  });
});

describe('signals', () => {
  it('computes an explainable signal with plan, backtest, fundamentals and insiders', async () => {
    const r = await app.inject('/api/signal/EXMP?refresh=true');
    expect(r.statusCode).toBe(200);
    const s = r.json();
    expect(['STRONG BUY', 'BUY']).toContain(s.label);
    expect(s.topReasons.length).toBeGreaterThan(0);
    expect(s.plan.stop).toBeLessThan(s.plan.entryLow);
    expect(s.backtest.method).toBe('technical-only');
    expect(s.fundamentals.pe).toBe(28.4);
    expect(s.macro.find((m: any) => m.key === 'commodity').symbol).toBe('GC=F');
    expect(s.smartMoney.inputs.insiderBuyers90d).toBe(1);
    expect(s.disclaimer).toMatch(/not financial advice/);
    const total = s.factors.flatMap((f: any) => f.reasons).reduce((a: number, x: any) => a + x.points, 0);
    expect(Math.round(total)).toBe(s.score);
  });

  it('records signal changes and fires a signal_change alert', async () => {
    await app.inject({ method: 'POST', url: '/api/watchlist', payload: { symbol: 'EXMP' } });
    await q(`update signals set label = 'SELL' where symbol = 'EXMP'`);
    await app.inject('/api/signal/EXMP?refresh=true');
    const events = (await app.inject('/api/alerts/events')).json();
    expect(events.some((e: any) => e.kind === 'signal_change' && e.message.includes('SELL →'))).toBe(true);
  });

  it('ranks top buys and sells per market', async () => {
    await app.inject('/api/signal/DOWN?refresh=true');
    const r = (await app.inject('/api/home?market=US')).json();
    expect(r.top.buys.map((b: any) => b.symbol)).toContain('EXMP');
    expect(r.top.sells.map((b: any) => b.symbol)).toContain('DOWN');
    expect(r.heatmap).toHaveLength(11);
    expect(r.commodities.find((c: any) => c.symbol === 'GC=F').price).toBeGreaterThan(0);
  });
});

describe('smart money', () => {
  it('shows Form 4 insiders and 13D/G filings for US stocks', async () => {
    const r = (await app.inject('/api/smart-money/stock/EXMP')).json();
    expect(r.insiders.trades.find((t: any) => t.code === 'P')).toMatchObject({ insider: 'DOE JANE', shares: 2500 });
    expect(r.insiders.buyers90d).toBe(1);
    expect(r.ownership[0].form).toBe('SCHEDULE 13G');
    expect(r.congress.available).toBe(false);
    expect(r.disclaimer).toMatch(/45 days/);
  });

  it('points Canadian stocks to SEDI / SEDAR+', async () => {
    const r = (await app.inject('/api/smart-money/stock/RY.TO')).json();
    expect(r.market).toBe('CA');
    expect(r.canada.links.map((l: any) => l.name).join()).toMatch(/SEDI.*SEDAR\+/);
  });

  it('lists seeded funds and toggles follow + alert rule', async () => {
    const funds = (await app.inject('/api/smart-money/funds')).json();
    const brk = funds.find((f: any) => f.name === 'Berkshire Hathaway');
    await app.inject({ method: 'POST', url: `/api/smart-money/funds/${brk.id}/follow`, payload: { follow: true } });
    const rules = (await app.inject('/api/alerts/rules')).json();
    expect(rules.some((r: any) => r.kind === 'fund_filing' && r.fund_id === brk.id)).toBe(true);
  });
});

describe('portfolio, alerts and paper trading', () => {
  it('computes P/L, allocations and CAD conversion', async () => {
    await app.inject({ method: 'POST', url: '/api/portfolio/holdings', payload: { symbol: 'EXMP', shares: 10, cost: 10, account: 'TFSA' } });
    await app.inject({ method: 'POST', url: '/api/portfolio/holdings', payload: { symbol: 'RY.TO', shares: 5, cost: 100, account: 'RRSP' } });
    const p = (await app.inject('/api/portfolio')).json();
    expect(p.baseCurrency).toBe('CAD');
    const ex = p.holdings.find((h: any) => h.symbol === 'EXMP');
    expect(ex.pl).toBeCloseTo(ex.value - 100, 6);
    expect(ex.valueBase).toBeGreaterThan(ex.value); // USD -> CAD
    expect(p.allocation.country.map((c: any) => c.key).sort()).toEqual(['CA', 'US']);
    expect(p.taxNotes.join(' ')).toMatch(/withholding/);
    const risk = (await app.inject('/api/portfolio/risk')).json();
    expect(risk.maxDrawdown).toBeLessThanOrEqual(0);
    expect(risk.correlation.symbols).toHaveLength(2);
  });

  it('fires a price alert once and deactivates it', async () => {
    const rule = (await app.inject({ method: 'POST', url: '/api/alerts/rules', payload: { kind: 'price_above', symbol: 'EXMP', threshold: 1 } })).json();
    const { evaluatePriceAlerts } = await import('../src/services/alerts.js');
    await evaluatePriceAlerts('EXMP', 50);
    await evaluatePriceAlerts('EXMP', 51);
    const events = (await app.inject('/api/alerts/events')).json().filter((e: any) => e.rule_id === rule.id);
    expect(events).toHaveLength(1);
    const rules = (await app.inject('/api/alerts/rules')).json();
    expect(rules.find((r: any) => r.id === rule.id).active).toBe(false);
  });

  it('paper trades with cash checks and realized P/L', async () => {
    const buy = await app.inject({ method: 'POST', url: '/api/paper/order', payload: { symbol: 'EXMP', side: 'buy', shares: 100, stop: 1 } });
    expect(buy.statusCode).toBe(200);
    const tooMuch = await app.inject({ method: 'POST', url: '/api/paper/order', payload: { symbol: 'EXMP', side: 'buy', shares: 1e9 } });
    expect(tooMuch.statusCode).toBe(400);
    const sell = await app.inject({ method: 'POST', url: '/api/paper/order', payload: { symbol: 'EXMP', side: 'sell', shares: 100 } });
    expect(sell.statusCode).toBe(200);
    const st = (await app.inject('/api/paper?market=US')).json();
    expect(st.positions).toHaveLength(0);
    expect(st.stats.closedTrades).toBe(1);
    expect(st.cash).toBeCloseTo(100_000, 6);
  });

  it('rejects paper orders on stale quotes', async () => {
    await q(`update quotes set fetched_at = now() - interval '1 day' where symbol = 'EXMP'`);
    net.offline = true;
    const r = await app.inject({ method: 'POST', url: '/api/paper/order', payload: { symbol: 'EXMP', side: 'buy', shares: 1 } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/stale/);
  });
});
