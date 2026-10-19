import { Link } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { SignalBadge } from '../components/SignalBadge';
import { Term } from '../components/Term';
import { Card, ErrorState, H2, Loading, Pill } from '../components/ui';
import { useApi } from '../lib/api';
import { date, num, pct, signColor, timeAgo } from '../lib/format';
import { useMarket } from '../lib/market';

const heatColor = (c: number | null) => {
  if (c == null) return 'bg-slate-200 dark:bg-slate-800';
  const a = Math.min(1, Math.abs(c) / 0.03);
  if (c >= 0) return a > 0.66 ? 'bg-green-600 text-white' : a > 0.33 ? 'bg-green-500/70 text-white' : 'bg-green-500/30';
  return a > 0.66 ? 'bg-red-600 text-white' : a > 0.33 ? 'bg-red-500/70 text-white' : 'bg-red-500/30';
};
const trendIcon = (t: string | null) => (t === 'up' ? '↗' : t === 'down' ? '↘' : t === 'flat' ? '→' : '·');

export default function Home() {
  const { market } = useMarket();
  const { data, error, loading, reload } = useApi(`/home?market=${market}`);
  if (loading && !data) return <Loading label="Loading markets…" />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return null;
  const st = data.status;
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{market === 'US' ? 'US markets' : 'Canadian markets'}</h1>
          <p className="text-xs text-slate-500">{market === 'US' ? 'NYSE · NASDAQ · prices in USD' : 'TSX · TSXV · prices in CAD'}</p>
        </div>
        <Pill tone={st.open ? 'green' : 'slate'}>
          <span className={`mr-1 inline-block h-2 w-2 rounded-full ${st.open ? 'bg-green-500' : 'bg-slate-400'}`} />
          {st.open ? 'Open' : 'Closed'} · {st.reason}
        </Pill>
      </div>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {data.commodities.map((c: any) => (
          <div key={c.symbol} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
            <div className="text-[11px] text-slate-500">{c.name}</div>
            <div className="text-sm font-semibold tabular-nums">{c.price != null ? num(c.price, c.symbol === 'CADUSD=X' ? 4 : 2) : '—'}</div>
            <div className={`text-[11px] tabular-nums ${signColor(c.changePct)}`}>{c.error ? 'unavailable' : pct(c.changePct, 2)}</div>
          </div>
        ))}
      </div>

      <H2 right={<span className="text-xs text-slate-500">daily change · 20-day trend</span>}>Sector heatmap</H2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {data.heatmap.map((s: any) => (
          <Link key={s.id} to={`/sectors/${s.id}`} className={`flex min-h-20 flex-col justify-between rounded-xl p-2 ${heatColor(s.changePct)}`}>
            <span className="text-xs font-medium leading-tight">
              {s.emoji} {s.name.split(' (')[0]}
            </span>
            <span className="flex items-end justify-between">
              <span className="text-sm font-bold tabular-nums">{s.changePct == null ? '—' : pct(s.changePct, 1)}</span>
              <span className="text-base" title={`20-day trend: ${s.trend ?? 'n/a'}`}>
                {trendIcon(s.trend)}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <H2 right={<span className="text-xs text-slate-500">computed {timeAgo(data.top.lastComputed)}</span>}>
        <Term id="score">Top signals today</Term>
      </H2>
      <Disclaimer compact />
      {data.top.coverage === 0 ? (
        <Card className="mt-2 text-sm text-slate-500">
          No signals computed yet. Signals are calculated after each close by the scheduler, or open any stock to compute its signal now.
        </Card>
      ) : (
        <>
          <SignalList title="Strongest buy setups" rows={data.top.buys} empty="No BUY signals in this market right now — that's information too." />
          <SignalList title="Weakest (sell / avoid)" rows={data.top.sells} empty="No SELL signals right now." />
          <p className="mt-2 text-xs text-slate-500">
            Based on {data.top.coverage} scored securities. Every buy signal lists its risks — open it before acting.
          </p>
        </>
      )}
      <div className="mt-6">
        <Disclaimer />
      </div>
    </div>
  );
}

function SignalList({ title, rows, empty }: { title: string; rows: any[]; empty: string }) {
  return (
    <Card className="mt-2 p-0">
      <h3 className="px-4 pt-3 text-sm font-semibold text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 pt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.symbol}>
              <Link to={`/stock/${encodeURIComponent(r.symbol)}`} className="flex min-h-14 items-center justify-between gap-2 px-4 py-2">
                <span className="min-w-0">
                  <span className="font-semibold">{r.symbol}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {r.name} · as of {date(r.as_of)} · {r.confidence} confidence
                  </span>
                </span>
                <SignalBadge label={r.label} score={r.score} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
