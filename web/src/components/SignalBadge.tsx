import type { SignalLabel } from '@tradecompass/signals';

export const labelTone = (label?: string | null) =>
  label === 'STRONG BUY' || label === 'BUY' ? 'buy' : label === 'SELL' || label === 'STRONG SELL' ? 'sell' : 'hold';

const styles = {
  buy: 'bg-green-600 text-white',
  hold: 'bg-amber-500 text-slate-950',
  sell: 'bg-red-600 text-white',
};

export function SignalBadge({ label, score, size = 'sm' }: { label?: SignalLabel | string | null; score?: number | null; size?: 'sm' | 'lg' }) {
  if (!label) return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800">No signal</span>;
  const tone = labelTone(label);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold ${styles[tone]} ${size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-2 py-0.5 text-[11px]'}`}
      aria-label={`Signal ${label}${score != null ? `, score ${score}` : ''}`}
    >
      {tone === 'buy' ? '▲' : tone === 'sell' ? '▼' : '■'} {label}
      {score != null && <span className="font-medium opacity-80">{score > 0 ? `+${score}` : score}</span>}
    </span>
  );
}

/** Horizontal −100..+100 meter. */
export function ScoreBar({ score }: { score: number }) {
  const pos = ((score + 100) / 200) * 100;
  return (
    <div className="relative mt-2 h-3 w-full rounded-full bg-gradient-to-r from-red-600 via-amber-400 to-green-600" aria-hidden>
      {[20, 40, 60, 80].map((x) => (
        <span key={x} className="absolute top-0 h-3 w-px bg-slate-950/40" style={{ left: `${x}%` }} />
      ))}
      <span className="absolute -top-1 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-white bg-slate-900 shadow" style={{ left: `${pos}%` }} />
      <div className="absolute top-4 flex w-full justify-between pt-1 text-[10px] text-slate-500">
        <span>−100</span>
        <span>Sell</span>
        <span>Hold</span>
        <span>Buy</span>
        <span>+100</span>
      </div>
    </div>
  );
}
