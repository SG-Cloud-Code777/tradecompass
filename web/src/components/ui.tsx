import type { ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { timeAgo } from '../lib/format';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${className}`}>{children}</div>;
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between">
      <h2 className="text-base font-semibold">{children}</h2>
      {right}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-sm text-slate-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const unavailable = error instanceof ApiError && error.status === 503;
  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm" role="alert">
      <p className="font-semibold text-red-600 dark:text-red-400">{unavailable ? 'Market data unavailable' : 'Something went wrong'}</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        {unavailable ? 'We could not reach the data provider and have no cached copy. Nothing is shown rather than guessing.' : error.message}
      </p>
      {error instanceof ApiError && error.detail && <p className="mt-1 break-words text-xs text-slate-500">{error.detail}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-3 min-h-11 rounded-xl bg-red-600 px-4 text-white">
          Try again
        </button>
      )}
    </div>
  );
}

export interface Meta {
  source: string;
  fetchedAt: string;
  stale: boolean;
  error?: string;
  lastBar?: string | null;
}

/** "Last updated" line; turns into a warning banner when data is stale. */
export function DataStatus({ meta, label = 'Updated' }: { meta?: Meta | null; label?: string }) {
  if (!meta) return null;
  if (meta.stale)
    return (
      <div className="my-2 rounded-xl border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" role="status">
        ⚠️ Stale data — last good update {timeAgo(meta.fetchedAt)} from {meta.source}
        {meta.lastBar ? ` (latest bar ${meta.lastBar})` : ''}. {meta.error ? `Reason: ${meta.error.slice(0, 160)}` : ''}
      </div>
    );
  return (
    <p className="text-xs text-slate-500">
      {label} {timeAgo(meta.fetchedAt)} · {meta.source}
      {meta.lastBar ? ` · last close ${meta.lastBar}` : ''}
    </p>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'sky' }) {
  const tones = {
    slate: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-green-500/15 text-green-700 dark:text-green-400',
    red: 'bg-red-500/15 text-red-700 dark:text-red-400',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-medium transition ${
            o.value === value ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, className = '' }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export const btn = 'min-h-11 rounded-xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50';
export const btnPrimary = `${btn} bg-sky-600 text-white`;
export const btnGhost = `${btn} bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100`;
export const input = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';
