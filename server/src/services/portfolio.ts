import { DEFAULT_USER_ID, one, q } from '../db/pool.js';
import { fxRate, type Ccy } from './fx.js';
import { getBars, getQuotes } from './prices.js';
import { ensureSecurity } from './securities.js';

export const ACCOUNTS = ['TFSA', 'RRSP', 'FHSA', 'RESP', 'Non-registered', 'Margin', 'US IRA/401k', 'US Taxable'] as const;

export async function settings(userId = DEFAULT_USER_ID) {
  return one<{ base_currency: Ccy; risk_pct: number }>(`select base_currency, risk_pct from users where id = $1`, [userId]);
}

export async function addHolding(h: { symbol: string; shares: number; cost: number; currency?: Ccy; account?: string; openedAt?: string; notes?: string }, userId = DEFAULT_USER_ID) {
  const sec = await ensureSecurity(h.symbol);
  return one(
    `insert into holdings (user_id, symbol, shares, cost_per_share, currency, account, opened_at, notes) values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [userId, sec.symbol, h.shares, h.cost, h.currency ?? sec.currency, h.account ?? 'Non-registered', h.openedAt ?? null, h.notes ?? null],
  );
}

export async function portfolio(userId = DEFAULT_USER_ID) {
  const s = (await settings(userId))!;
  const base = s.base_currency;
  const rows = await q<any>(
    `select h.*, s.name, s.sector, s.market, s.kind from holdings h left join securities s on s.symbol = h.symbol where h.user_id = $1 order by h.id`,
    [userId],
  );
  const { quotes, errors } = await getQuotes([...new Set(rows.map((r) => r.symbol))]);
  const fx: Record<Ccy, number | null> = { CAD: base === 'CAD' ? 1 : null, USD: base === 'USD' ? 1 : null };
  let fxError: string | null = null;
  try {
    fx.CAD = (await fxRate('CAD', base)).rate;
    fx.USD = (await fxRate('USD', base)).rate;
  } catch (e) {
    fxError = `FX unavailable — ${base === 'CAD' ? 'USD' : 'CAD'} positions are excluded from totals: ${(e as Error).message}`;
  }
  const holdings = rows.map((r) => {
    const qt = quotes.get(r.symbol);
    const price = qt?.price ?? null;
    const value = price != null ? price * r.shares : null;
    const cost = r.cost_per_share * r.shares;
    const rate = fx[r.currency as Ccy];
    return {
      id: r.id,
      symbol: r.symbol,
      name: r.name,
      sector: r.sector,
      market: r.market,
      account: r.account,
      currency: r.currency,
      shares: r.shares,
      costPerShare: r.cost_per_share,
      price,
      changePct: qt?.changePct ?? null,
      value,
      cost,
      pl: value != null ? value - cost : null,
      plPct: value != null && cost ? value / cost - 1 : null,
      valueBase: value != null && rate != null ? value * rate : null,
      costBase: rate != null ? cost * rate : null,
      quoteMeta: qt?.meta ?? null,
      error: errors[r.symbol] ?? null,
    };
  });
  const priced = holdings.filter((h) => h.valueBase != null);
  const total = priced.reduce((a, h) => a + h.valueBase!, 0);
  const totalCost = priced.reduce((a, h) => a + (h.costBase ?? 0), 0);
  const group = (key: (h: (typeof holdings)[0]) => string) => {
    const m = new Map<string, number>();
    for (const h of priced) m.set(key(h), (m.get(key(h)) ?? 0) + h.valueBase!);
    return [...m.entries()].map(([k, v]) => ({ key: k, value: v, pct: total ? v / total : 0 })).sort((a, b) => b.value - a.value);
  };
  const allocation = {
    sector: group((h) => h.sector ?? 'other'),
    country: group((h) => h.market ?? 'US'),
    currency: group((h) => h.currency),
    account: group((h) => h.account),
  };
  return {
    baseCurrency: base,
    fx: { ...fx, error: fxError },
    holdings,
    totals: { value: total, cost: totalCost, pl: total - totalCost, plPct: totalCost ? total / totalCost - 1 : null },
    allocation,
    taxNotes: taxNotes(holdings),
  };
}

/** Account-placement hints for Canadians — general information, not tax advice. */
function taxNotes(holdings: { symbol: string; market: string; account: string }[]) {
  const notes: string[] = [];
  if (holdings.some((h) => h.market === 'US' && (h.account === 'TFSA' || h.account === 'FHSA' || h.account === 'RESP')))
    notes.push('US dividends in a TFSA/FHSA/RESP lose 15% to US withholding tax that cannot be recovered. In an RRSP the tax treaty generally exempts US-listed stocks/ETFs from withholding.');
  if (holdings.some((h) => h.market === 'US' && h.account === 'Non-registered'))
    notes.push('US withholding (15% with a W-8BEN on file) in a non-registered account can usually be claimed back as a foreign tax credit.');
  if (holdings.some((h) => h.market === 'CA' && h.account === 'Non-registered'))
    notes.push('Eligible dividends from Canadian corporations in a non-registered account qualify for the dividend tax credit.');
  if (holdings.some((h) => h.market === 'CA' && /\.V$/.test(h.symbol) && (h.account === 'TFSA' || h.account === 'RRSP')))
    notes.push('Check TSXV holdings are "qualified investments" for registered accounts (most TSXV-listed shares are).');
  return notes;
}

/** Concentration, correlation and a hypothetical max drawdown of today's weights over the last year. */
export async function riskDashboard(userId = DEFAULT_USER_ID) {
  const p = await portfolio(userId);
  const warnings: string[] = [];
  for (const s of p.allocation.sector) if (s.pct > 0.3) warnings.push(`${(s.pct * 100).toFixed(0)}% in ${s.key} — above the 30% single-sector guideline`);
  const bySymbol = new Map<string, number>();
  for (const h of p.holdings) if (h.valueBase != null) bySymbol.set(h.symbol, (bySymbol.get(h.symbol) ?? 0) + h.valueBase);
  for (const [sym, v] of bySymbol) if (p.totals.value && v / p.totals.value > 0.15) warnings.push(`${sym} is ${((v / p.totals.value) * 100).toFixed(0)}% of the portfolio — above the 15% single-position guideline`);
  for (const c of p.allocation.currency) if (c.pct > 0.8 && p.allocation.currency.length > 0 && p.holdings.length > 3) warnings.push(`${(c.pct * 100).toFixed(0)}% of assets are in ${c.key}`);

  const symbols = [...bySymbol.keys()];
  const series = new Map<string, Map<number, number>>();
  for (const s of symbols) {
    const bars = await getBars(s).then((r) => r.bars.slice(-260)).catch(() => []);
    series.set(s, new Map(bars.map((b) => [b.t, b.c])));
  }
  const dates = [...(series.get(symbols[0])?.keys() ?? [])].filter((t) => symbols.every((s) => series.get(s)!.has(t))).sort((a, b) => a - b);
  const rets = new Map<string, number[]>();
  for (const s of symbols) {
    const px = dates.map((t) => series.get(s)!.get(t)!);
    rets.set(s, px.slice(1).map((c, i) => c / px[i] - 1));
  }
  const corr = (a: number[], b: number[]) => {
    const n = Math.min(a.length, b.length, 90);
    const x = a.slice(-n);
    const y = b.slice(-n);
    const mx = x.reduce((s, v) => s + v, 0) / n;
    const my = y.reduce((s, v) => s + v, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  const matrix = dates.length > 30 ? symbols.map((a) => symbols.map((b) => (a === b ? 1 : corr(rets.get(a)!, rets.get(b)!)))) : null;
  if (matrix)
    for (let i = 0; i < symbols.length; i++)
      for (let j = i + 1; j < symbols.length; j++)
        if (matrix[i][j] > 0.85) warnings.push(`${symbols[i]} and ${symbols[j]} move almost together (correlation ${matrix[i][j].toFixed(2)}) — less diversification than it looks`);

  let maxDrawdown: number | null = null;
  if (dates.length > 30 && p.totals.value) {
    const w = symbols.map((s) => bySymbol.get(s)! / p.totals.value);
    let eq = 1;
    let peak = 1;
    let dd = 0;
    for (let i = 0; i < dates.length - 1; i++) {
      eq *= 1 + symbols.reduce((a, s, k) => a + w[k] * rets.get(s)![i], 0);
      peak = Math.max(peak, eq);
      dd = Math.min(dd, eq / peak - 1);
    }
    maxDrawdown = dd;
  }
  return {
    warnings,
    correlation: matrix ? { symbols, matrix } : null,
    maxDrawdown,
    drawdownNote: 'Hypothetical: today\'s weights replayed over the past year of daily closes (local currency, ignores FX and dividends).',
    days: dates.length,
  };
}
