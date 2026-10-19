export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <p className="text-[11px] leading-snug text-slate-500">
        Educational only · Not financial advice · Past performance doesn't guarantee future results.
      </p>
    );
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-200" role="note">
      <strong>Not financial advice.</strong> TradeCompass is an educational tool. Signals are rule-based readings of past data, are often wrong, and
      don't account for your personal situation. Past performance doesn't guarantee future results. You can lose money.
    </div>
  );
}
