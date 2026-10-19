import type { Market } from '@tradecompass/signals';

/**
 * Exchange holiday calendars (full-day closures). Verify yearly against
 * nyse.com/markets/hours-calendars and tsx.com/trading/calendars-and-trading-hours.
 */
const HOLIDAYS: Record<Market, Set<string>> = {
  US: new Set([
    // 2026
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19',
    '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
    // 2027
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18',
    '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
  ]),
  CA: new Set([
    // 2026
    '2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01', '2026-08-03',
    '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-28',
    // 2027
    '2027-01-01', '2027-02-15', '2027-03-26', '2027-05-24', '2027-07-01', '2027-08-02',
    '2027-09-06', '2027-10-11', '2027-12-27', '2027-12-28',
  ]),
};

/** NYSE early closes (13:00 ET). */
const EARLY_CLOSE: Record<Market, Set<string>> = {
  US: new Set(['2026-11-27', '2026-12-24', '2027-11-26']),
  CA: new Set(['2026-12-24', '2027-12-24']),
};

function etParts(d: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: parts.weekday as string,
  };
}

export interface MarketStatus {
  market: Market;
  open: boolean;
  session: 'pre' | 'open' | 'after' | 'closed';
  reason: string;
  /** Exchange-local date (ET for both NYSE and TSX). */
  date: string;
  timezone: 'America/New_York';
}

/** NYSE/NASDAQ and TSX/TSXV both trade 9:30–16:00 Eastern. */
export function marketStatus(market: Market, now = new Date()): MarketStatus {
  const { date, minutes, weekday } = etParts(now);
  const base = { market, date, timezone: 'America/New_York' as const };
  if (weekday === 'Sat' || weekday === 'Sun') return { ...base, open: false, session: 'closed', reason: 'Weekend' };
  if (HOLIDAYS[market].has(date)) return { ...base, open: false, session: 'closed', reason: 'Exchange holiday' };
  const openAt = 9 * 60 + 30;
  const closeAt = EARLY_CLOSE[market].has(date) ? 13 * 60 : 16 * 60;
  if (minutes < openAt) return { ...base, open: false, session: 'pre', reason: 'Opens 9:30 ET' };
  if (minutes >= closeAt)
    return { ...base, open: false, session: 'after', reason: closeAt === 13 * 60 ? 'Closed early (13:00 ET)' : 'Closed at 16:00 ET' };
  return { ...base, open: true, session: 'open', reason: closeAt === 13 * 60 ? 'Open — early close 13:00 ET' : 'Open until 16:00 ET' };
}

export function isTradingDay(market: Market, date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const wd = d.getUTCDay();
  return wd !== 0 && wd !== 6 && !HOLIDAYS[market].has(date);
}

/** Most recent session date whose close should already be in daily bars. */
export function lastCompletedSession(market: Market, now = new Date()): string {
  const { date, minutes } = etParts(now);
  let d = new Date(`${date}T12:00:00Z`);
  const todayDone = isTradingDay(market, date) && minutes >= 16 * 60 + 30;
  if (!todayDone) d = new Date(d.getTime() - 86_400_000);
  while (!isTradingDay(market, d.toISOString().slice(0, 10))) d = new Date(d.getTime() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

export const marketOf = (symbol: string): Market => (/\.(TO|V|NE|CN)$/i.test(symbol) ? 'CA' : 'US');
