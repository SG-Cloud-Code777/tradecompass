export const money = (n: number | null | undefined, ccy?: string | null, digits = 2) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n) >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sym = ccy === 'CAD' ? 'C$' : ccy === 'USD' ? 'US$' : '';
  return `${sym}${s}`;
};

export const num = (n: number | null | undefined, digits = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits }));

export const pct = (n: number | null | undefined, digits = 1, signed = true) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = (n * 100).toFixed(digits);
  return `${signed && n > 0 ? '+' : ''}${v}%`;
};

export const signColor = (n: number | null | undefined) => (n == null ? 'text-slate-400' : n > 0 ? 'text-green-500' : n < 0 ? 'text-red-500' : 'text-slate-400');

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const date = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
