import type { Market } from '@tradecompass/signals';
import { DEFAULT_USER_ID, one, pool, q } from '../db/pool.js';
import { marketOf } from '../lib/marketHours.js';
import { getQuote, getQuotes } from './prices.js';
import { ensureSecurity } from './securities.js';

const START = 100_000;

async function account(market: Market, userId = DEFAULT_USER_ID) {
  let a = await one<any>(`select * from paper_accounts where user_id = $1 and market = $2`, [userId, market]);
  if (!a)
    a = await one(`insert into paper_accounts (user_id, market, currency, cash, starting) values ($1,$2,$3,$4,$4) returning *`, [
      userId,
      market,
      market === 'US' ? 'USD' : 'CAD',
      START,
    ]);
  return a;
}

export async function paperState(market: Market, userId = DEFAULT_USER_ID) {
  const a = await account(market, userId);
  const positions = await q<any>(`select * from paper_positions where account_id = $1 order by symbol`, [a.id]);
  const { quotes } = await getQuotes(positions.map((p) => p.symbol));
  const pos = positions.map((p) => {
    const qt = quotes.get(p.symbol);
    const value = qt ? qt.price * p.shares : null;
    return { ...p, price: qt?.price ?? null, value, pl: value != null ? value - p.avg_cost * p.shares : null, quoteMeta: qt?.meta ?? null };
  });
  const invested = pos.reduce((s, p) => s + (p.value ?? p.avg_cost * p.shares), 0);
  const trades = await q(`select * from paper_trades where account_id = $1 order by at desc limit 50`, [a.id]);
  const closed = await one<{ n: number; wins: number; realized: number }>(
    `select count(*)::int n, count(*) filter (where realized_pl > 0)::int wins, coalesce(sum(realized_pl),0)::float8 realized
     from paper_trades where account_id = $1 and side = 'sell'`,
    [a.id],
  );
  const equity = a.cash + invested;
  return {
    market,
    currency: a.currency,
    cash: a.cash,
    starting: a.starting,
    equity,
    returnPct: equity / a.starting - 1,
    positions: pos,
    trades,
    stats: { closedTrades: closed?.n ?? 0, winRate: closed?.n ? closed.wins / closed.n : null, realized: closed?.realized ?? 0 },
  };
}

export class PaperError extends Error {
  statusCode = 400;
}

/** Market orders fill at the latest (possibly delayed) quote. No leverage, no shorting. */
export async function placeOrder(o: { symbol: string; side: 'buy' | 'sell'; shares: number; stop?: number | null; target?: number | null; signalLabel?: string | null; reason?: string }, userId = DEFAULT_USER_ID) {
  const sec = await ensureSecurity(o.symbol);
  const market = marketOf(sec.symbol);
  const a = await account(market, userId);
  if (!(o.shares > 0)) throw new PaperError('Shares must be positive');
  const qt = await getQuote(sec.symbol);
  if (qt.meta.stale) throw new PaperError(`Quote for ${sec.symbol} is stale (${qt.meta.error ?? 'old data'}) — order rejected`);
  const price = qt.price;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const pos = (await client.query(`select * from paper_positions where account_id = $1 and symbol = $2 for update`, [a.id, sec.symbol])).rows[0];
    const cash = (await client.query(`select cash from paper_accounts where id = $1 for update`, [a.id])).rows[0].cash as number;
    let realized: number | null = null;
    if (o.side === 'buy') {
      const cost = price * o.shares;
      if (cost > cash) throw new PaperError(`Not enough cash: need ${cost.toFixed(2)}, have ${cash.toFixed(2)}`);
      await client.query(`update paper_accounts set cash = cash - $2 where id = $1`, [a.id, cost]);
      if (pos) {
        const shares = pos.shares + o.shares;
        await client.query(`update paper_positions set shares = $3, avg_cost = $4, stop = coalesce($5, stop), target = coalesce($6, target) where account_id = $1 and symbol = $2`, [
          a.id,
          sec.symbol,
          shares,
          (pos.avg_cost * pos.shares + cost) / shares,
          o.stop ?? null,
          o.target ?? null,
        ]);
      } else {
        await client.query(`insert into paper_positions (account_id, symbol, shares, avg_cost, stop, target) values ($1,$2,$3,$4,$5,$6)`, [
          a.id,
          sec.symbol,
          o.shares,
          price,
          o.stop ?? null,
          o.target ?? null,
        ]);
      }
    } else {
      if (!pos || pos.shares < o.shares) throw new PaperError(`You hold ${pos?.shares ?? 0} shares of ${sec.symbol}`);
      realized = (price - pos.avg_cost) * o.shares;
      await client.query(`update paper_accounts set cash = cash + $2 where id = $1`, [a.id, price * o.shares]);
      if (pos.shares - o.shares <= 1e-9) await client.query(`delete from paper_positions where account_id = $1 and symbol = $2`, [a.id, sec.symbol]);
      else await client.query(`update paper_positions set shares = shares - $3 where account_id = $1 and symbol = $2`, [a.id, sec.symbol, o.shares]);
    }
    await client.query(
      `insert into paper_trades (account_id, symbol, side, shares, price, reason, signal_label, realized_pl) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [a.id, sec.symbol, o.side, o.shares, price, o.reason ?? 'manual', o.signalLabel ?? null, realized],
    );
    await client.query('commit');
    return { filled: true, price, quoteAsOf: qt.asOf };
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

/** Scheduler hook: close paper positions whose stop or target was hit. */
export async function checkPaperStops() {
  const rows = await q<any>(
    `select p.*, a.user_id from paper_positions p join paper_accounts a on a.id = p.account_id where p.stop is not null or p.target is not null`,
  );
  for (const p of rows) {
    const qt = await getQuote(p.symbol).catch(() => null);
    if (!qt || qt.meta.stale) continue;
    if (p.stop != null && qt.price <= p.stop)
      await placeOrder({ symbol: p.symbol, side: 'sell', shares: p.shares, reason: 'stop-loss' }, p.user_id).catch(() => undefined);
    else if (p.target != null && qt.price >= p.target)
      await placeOrder({ symbol: p.symbol, side: 'sell', shares: p.shares, reason: 'target' }, p.user_id).catch(() => undefined);
  }
}

export async function resetPaper(market: Market, userId = DEFAULT_USER_ID) {
  const a = await account(market, userId);
  await q(`delete from paper_trades where account_id = $1`, [a.id]);
  await q(`delete from paper_positions where account_id = $1`, [a.id]);
  await q(`update paper_accounts set cash = starting where id = $1`, [a.id]);
  return paperState(market, userId);
}
