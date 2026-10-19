import { config } from '../config.js';
import { getJson } from '../lib/http.js';

export interface CongressTrade {
  member: string;
  chamber: 'House' | 'Senate';
  type: string;
  amount: string;
  transactionDate: string;
  disclosureDate: string;
  owner: string | null;
  link: string | null;
}

/** Official sources (PDF/HTML only — no structured API). */
export const CONGRESS_SOURCES = [
  { name: 'House Clerk — Periodic Transaction Reports', url: 'https://disclosures-clerk.house.gov/FinancialDisclosure' },
  { name: 'Senate eFD — Periodic Transaction Reports', url: 'https://efdsearch.senate.gov/search/' },
];

export function parseFmpTrades(rows: any[], chamber: 'House' | 'Senate'): CongressTrade[] {
  return (rows ?? []).map((r) => ({
    member: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.representative || r.office || 'Unknown',
    chamber,
    type: r.type ?? r.transaction ?? '',
    amount: r.amount ?? '',
    transactionDate: r.transactionDate ?? '',
    disclosureDate: r.disclosureDate ?? '',
    owner: r.owner ?? null,
    link: r.link ?? null,
  }));
}

/**
 * Congressional trade disclosures (STOCK Act: filed within 45 days of the trade).
 * Structured data comes from Financial Modeling Prep when FMP_API_KEY is set.
 */
export async function congressTrades(symbol: string): Promise<{ available: boolean; reason?: string; trades: CongressTrade[] }> {
  if (!config.fmpKey) return { available: false, reason: 'Set FMP_API_KEY to load structured congressional trades.', trades: [] };
  const base = 'https://financialmodelingprep.com/stable';
  const [senate, house] = await Promise.all([
    getJson(`${base}/senate-trades?symbol=${encodeURIComponent(symbol)}&apikey=${config.fmpKey}`, { provider: 'fmp' }),
    getJson(`${base}/house-trades?symbol=${encodeURIComponent(symbol)}&apikey=${config.fmpKey}`, { provider: 'fmp' }),
  ]);
  const trades = [...parseFmpTrades(senate, 'Senate'), ...parseFmpTrades(house, 'House')].sort((a, b) =>
    b.disclosureDate.localeCompare(a.disclosureDate),
  );
  return { available: true, trades: trades.slice(0, 30) };
}
