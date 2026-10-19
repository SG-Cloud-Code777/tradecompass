import { SECTOR_ORDER, SECTORS, type SectorId } from '@tradecompass/signals';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SignalBadge } from '../components/SignalBadge';
import { Term } from '../components/Term';
import { Card, DataStatus, ErrorState, H2, Loading, Pill, Tabs } from '../components/ui';
import { COUNTRY_NOTES } from '../content/countryNotes';
import { useApi } from '../lib/api';
import { money, pct, signColor, timeAgo } from '../lib/format';
import { useMarket } from '../lib/market';
import { WatchlistTab } from './Watchlist';

type Tab = SectorId | 'watchlist';

export default function Sectors() {
  const params = useParams();
  const nav = useNavigate();
  const tab = (params.sector as Tab) ?? 'gold';
  return (
    <div>
      <Tabs<Tab>
        value={tab}
        onChange={(v) => nav(`/sectors/${v}`, { replace: true })}
        options={[...SECTOR_ORDER.map((id) => ({ value: id as Tab, label: `${SECTORS[id].emoji} ${SECTORS[id].name.split(' (')[0]}` })), { value: 'watchlist', label: '⭐ Watchlist' }]}
      />
      {tab === 'watchlist' ? <WatchlistTab /> : SECTORS[tab] ? <SectorView sector={tab} /> : <p className="py-8 text-slate-500">Unknown sector.</p>}
    </div>
  );
}

function SectorView({ sector }: { sector: SectorId }) {
  const { market } = useMarket();
  const { data, error, loading, reload } = useApi(`/sectors/${sector}?market=${market}`);
  const macro = useApi(`/macro?sector=${sector}`);
  const p = SECTORS[sector];
  return (
    <div className="mt-3">
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-xl font-bold">
          {p.emoji} {p.name} <span className="text-sm font-normal text-slate-500">· {market === 'US' ? '🇺🇸 USD' : '🇨🇦 CAD'}</span>
        </h1>
        {data && <TrendPill trend={data.trend} ret={data.avgRet20} breadth={data.breadth} />}
      </div>

      <Card className="mt-3">
        <h2 className="text-sm font-semibold">What moves this sector</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{p.whatMovesIt}</p>
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Key drivers</h3>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {p.drivers.map((d) => (
            <li key={d}>
              <Pill>{d}</Pill>
            </li>
          ))}
        </ul>
        {macro.data && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {macro.data
              .filter((m: any) => p.sensitivities[m.key as keyof typeof p.sensitivities] != null)
              .map((m: any) => {
                const coef = p.sensitivities[m.key as keyof typeof p.sensitivities] ?? 0;
                const dir = m.direction === 'up' ? 1 : m.direction === 'down' ? -1 : 0;
                const effect = m.direction == null ? 'n/a' : coef * dir > 0 ? 'tailwind' : coef * dir < 0 ? 'headwind' : 'neutral';
                return (
                  <div key={m.key} className="rounded-xl bg-slate-100 p-2 text-xs dark:bg-slate-800/60">
                    <div className="text-slate-500">{m.name}</div>
                    <div className="font-semibold">
                      {m.direction ? `${m.direction === 'up' ? '↗ rising' : m.direction === 'down' ? '↘ falling' : '→ flat'}` : 'unavailable'}{' '}
                      <span className={effect === 'tailwind' ? 'text-green-500' : effect === 'headwind' ? 'text-red-500' : 'text-slate-500'}>· {effect}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          <Term id="macro">How the macro factor works</Term>
        </p>
      </Card>

      {loading && !data && <Loading label="Loading sector…" />}
      {error && <ErrorState error={error} onRetry={() => reload()} />}
      {data && (
        <>
          {data.stale && (
            <DataStatus meta={{ source: 'quotes', fetchedAt: data.lastUpdated ?? new Date(0).toISOString(), stale: true, error: Object.keys(data.errors).length ? `No data for ${Object.keys(data.errors).join(', ')}` : undefined }} />
          )}
          <H2 right={<span className="text-xs text-slate-500">updated {timeAgo(data.lastUpdated)}</span>}>Top movers today</H2>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {data.movers.length === 0 && <p className="text-sm text-slate-500">No quotes yet.</p>}
            {data.movers.map((m: any) => (
              <Link key={m.symbol} to={`/stock/${encodeURIComponent(m.symbol)}`} className="min-w-28 shrink-0 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="text-sm font-semibold">{m.symbol}</div>
                <div className={`text-lg font-bold tabular-nums ${signColor(m.changePct)}`}>{pct(m.changePct, 1)}</div>
              </Link>
            ))}
          </div>

          <H2>All {p.name.split(' (')[0].toLowerCase()} names</H2>
          <Card className="p-0">
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.members.map((m: any) => (
                <li key={m.symbol}>
                  <Link to={`/stock/${encodeURIComponent(m.symbol)}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {m.symbol}
                        {m.kind === 'etf' && <Pill tone="sky">ETF</Pill>}
                        {m.flags.cadHedged && <Pill tone="sky">CAD-hedged</Pill>}
                        {m.flags.venture && <Pill tone="amber">TSXV junior</Pill>}
                        {m.flags.leveraged && <Pill tone="red">Leveraged</Pill>}
                      </span>
                      <span className="block truncate text-xs text-slate-500">{m.name}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {m.error ? (
                        <span className="text-xs text-red-500">data unavailable</span>
                      ) : (
                        <span className="text-sm tabular-nums">
                          {money(m.price, m.currency)} <span className={signColor(m.changePct)}>{pct(m.changePct, 1)}</span>
                        </span>
                      )}
                      <SignalBadge label={m.signal?.label} score={m.signal?.score} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          {data.members.some((m: any) => m.flags.venture) && (
            <p className="mt-2 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              ⚠️ TSX Venture juniors are small, often pre-revenue companies that fund themselves by issuing shares. Expect large swings, thin trading and dilution.
            </p>
          )}
        </>
      )}
      <CountryNotes />
    </div>
  );
}

export function CountryNotes() {
  const { market } = useMarket();
  const n = COUNTRY_NOTES[market];
  return (
    <Card className="mt-5">
      <h2 className="text-sm font-semibold">{n.title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
        {n.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        General information, not tax advice. <Term id="withholding">US withholding tax</Term> · <Term id="hedged">CAD-hedged ETFs</Term>
      </p>
    </Card>
  );
}

function TrendPill({ trend, ret, breadth }: { trend: string | null; ret: number | null; breadth: number | null }) {
  if (!trend) return <Pill>Trend n/a</Pill>;
  return (
    <span className="text-right">
      <Pill tone={trend === 'up' ? 'green' : trend === 'down' ? 'red' : 'amber'}>
        {trend === 'up' ? '↗ Uptrend' : trend === 'down' ? '↘ Downtrend' : '→ Flat'}
      </Pill>
      <span className="mt-1 block text-[11px] text-slate-500">
        20d {pct(ret, 1)} · {breadth != null ? `${Math.round(breadth * 100)}% above 50-day` : ''}
      </span>
    </span>
  );
}
