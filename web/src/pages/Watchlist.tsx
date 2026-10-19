import { Link } from 'react-router-dom';
import { SignalBadge } from '../components/SignalBadge';
import { Card, ErrorState, Loading } from '../components/ui';
import { del, useApi } from '../lib/api';
import { money, pct, signColor } from '../lib/format';
import { currencyOf, useMarket } from '../lib/market';

export function WatchlistTab() {
  const { market } = useMarket();
  const { data, error, loading, reload } = useApi<any[]>('/watchlist');
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  const rows = (data ?? []).filter((r) => (r.market ?? 'US') === market);
  return (
    <div className="mt-3">
      <h1 className="text-xl font-bold">⭐ Watchlist · {market === 'US' ? '🇺🇸' : '🇨🇦'}</h1>
      <p className="text-xs text-slate-500">Adding a stock also creates a "signal changed" alert. Use 🔍 to find stocks, then tap ☆ Watch.</p>
      {rows.length === 0 ? (
        <Card className="mt-3 text-sm text-slate-500">Nothing on your {market} watchlist yet.</Card>
      ) : (
        <Card className="mt-3 p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((r) => (
              <li key={r.symbol} className="flex items-center gap-2 px-4">
                <Link to={`/stock/${encodeURIComponent(r.symbol)}`} className="flex min-h-14 flex-1 items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold">{r.symbol}</span>
                    <span className="block text-xs text-slate-500">{r.name}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm tabular-nums">
                      {money(r.price, currencyOf(market))} <span className={signColor(r.changePct)}>{pct(r.changePct, 1)}</span>
                    </span>
                    <SignalBadge label={r.label} score={r.score} />
                  </span>
                </Link>
                <button
                  className="min-h-11 min-w-11 text-slate-400"
                  aria-label={`Remove ${r.symbol}`}
                  onClick={async () => {
                    await del(`/watchlist/${encodeURIComponent(r.symbol)}`);
                    reload();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
