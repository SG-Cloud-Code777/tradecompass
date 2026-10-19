import { Link, useParams } from 'react-router-dom';
import { Card, ErrorState, H2, Loading, Pill } from '../components/ui';
import { useApi } from '../lib/api';
import { date, money, pct } from '../lib/format';

function Rows({ rows, showChange }: { rows: any[]; showChange?: boolean }) {
  if (!rows.length) return <p className="px-4 py-3 text-sm text-slate-500">None.</p>;
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {rows.map((r) => (
        <li key={r.cusip} className="flex min-h-12 items-center justify-between gap-2 px-4 py-1.5 text-sm">
          <span className="min-w-0">
            {r.ticker ? (
              <Link to={`/stock/${encodeURIComponent(r.ticker)}`} className="font-semibold text-sky-600 dark:text-sky-400">
                {r.ticker}
              </Link>
            ) : (
              <span className="font-semibold text-slate-500">{r.cusip}</span>
            )}
            <span className="block truncate text-xs text-slate-500">{r.issuer}</span>
          </span>
          <span className="shrink-0 text-right tabular-nums">
            {money(r.value, 'USD', 0)}
            <span className="block text-xs text-slate-500">
              {r.weight ? `${(r.weight * 100).toFixed(1)}% of portfolio` : ''}
              {showChange && r.sharesChangePct != null && r.status !== 'exited' ? ` · shares ${pct(r.sharesChangePct, 0)}` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Fund() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/smart-money/funds/${id}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return null;
  const f = data.filing;
  return (
    <div>
      <Link to="/smart-money" className="text-sm text-sky-600 dark:text-sky-400">
        ← Big players
      </Link>
      <h1 className="mt-1 text-xl font-bold">{data.fund.name}</h1>
      <p className="text-sm text-slate-500">
        {data.fund.style} · CIK {data.fund.cik}
      </p>
      {!f ? (
        <Card className="mt-3 text-sm text-slate-500">No 13F loaded yet. Go back and tap “Load latest 13F”.</Card>
      ) : (
        <>
          <Card className="mt-3 border-amber-500/50">
            <p className="text-sm">
              Holdings as of <strong>{date(f.period)}</strong>, filed {date(f.filed)} ({f.filingLagDays} days later). This data is now <strong>{f.dataAgeDays} days old</strong>.
            </p>
            <p className="mt-1 text-xs text-slate-500">{f.note}</p>
            <p className="mt-2 text-sm">
              {f.positions} positions · {money(Number(f.totalValue), 'USD', 0)} reported value
              {f.comparedTo ? ` · compared with quarter ending ${date(f.comparedTo)}` : ' · no prior quarter loaded to compare'}
            </p>
          </Card>
          {data.changes && (
            <>
              <H2>
                <Pill tone="green">New positions</Pill>
              </H2>
              <Card className="p-0">
                <Rows rows={data.changes.new} />
              </Card>
              <H2>
                <Pill tone="green">Added to</Pill>
              </H2>
              <Card className="p-0">
                <Rows rows={data.changes.added} showChange />
              </Card>
              <H2>
                <Pill tone="red">Trimmed</Pill>
              </H2>
              <Card className="p-0">
                <Rows rows={data.changes.trimmed} showChange />
              </Card>
              <H2>
                <Pill tone="red">Sold out</Pill>
              </H2>
              <Card className="p-0">
                <Rows rows={data.changes.exited} />
              </Card>
            </>
          )}
          <H2>Top 25 holdings</H2>
          <Card className="p-0">
            <Rows rows={data.top} />
          </Card>
          <p className="mt-3 text-xs text-slate-500">Tickers are matched from CUSIPs via OpenFIGI and name matching; unmatched rows show the CUSIP. Not financial advice.</p>
        </>
      )}
    </div>
  );
}
