import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { Term } from '../components/Term';
import { btnGhost, btnPrimary, Card, ErrorState, H2, input, Loading, Pill, Stat, Tabs } from '../components/ui';
import { del, post, put, useApi } from '../lib/api';
import { date, money, pct, signColor, timeAgo } from '../lib/format';

type Tab = 'holdings' | 'risk' | 'alerts' | 'settings';

export default function Portfolio() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) ?? 'holdings';
  return (
    <div>
      <h1 className="text-xl font-bold">💼 Portfolio</h1>
      <p className="mb-2 text-xs text-slate-500">Holds both 🇺🇸 and 🇨🇦 positions; totals are converted to your base currency.</p>
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setSp({ tab: t }, { replace: true })}
        options={[
          { value: 'holdings', label: 'Holdings' },
          { value: 'risk', label: 'Risk' },
          { value: 'alerts', label: 'Alerts' },
          { value: 'settings', label: 'Settings' },
        ]}
      />
      <div className="mt-3">
        {tab === 'holdings' && <Holdings />}
        {tab === 'risk' && <Risk />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'settings' && <Settings />}
      </div>
    </div>
  );
}

function AllocBars({ title, rows, ccy }: { title: string; rows: { key: string; value: number; pct: number }[]; ccy: string }) {
  const label = (k: string) => (k === 'US' ? '🇺🇸 US' : k === 'CA' ? '🇨🇦 Canada' : k.replace('_', ' & '));
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-1 space-y-1.5">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex justify-between text-sm">
              <span>{label(r.key)}</span>
              <span className="tabular-nums">
                {(r.pct * 100).toFixed(1)}% · {money(r.value, ccy, 0)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
              <div className={`h-2 rounded-full ${r.pct > 0.3 && title === 'By sector' ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${Math.max(2, r.pct * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Holdings() {
  const { data, error, loading, reload } = useApi('/portfolio');
  const settings = useApi('/settings');
  const [form, setForm] = useState({ symbol: '', shares: '', cost: '', account: 'TFSA' });
  const [err, setErr] = useState<string | null>(null);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return null;
  const base = data.baseCurrency;
  return (
    <div>
      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={`Value (${base})`} value={money(data.totals.value, base, 0)} />
          <Stat label="Cost" value={money(data.totals.cost, base, 0)} />
          <Stat label="P/L" value={<span className={signColor(data.totals.pl)}>{money(data.totals.pl, base, 0)}</span>} sub={pct(data.totals.plPct)} />
        </div>
        {data.fx.error ? (
          <p className="mt-2 text-xs text-amber-600">{data.fx.error}</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">FX: 1 USD = {data.fx.USD.toFixed(4)} {base} · 1 CAD = {data.fx.CAD.toFixed(4)} {base}</p>
        )}
      </Card>

      <H2>Positions</H2>
      {data.holdings.length === 0 ? (
        <Card className="text-sm text-slate-500">No holdings yet. Add your first position below.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.holdings.map((h: any) => (
              <li key={h.id} className="flex items-center gap-2 px-4 py-2">
                <Link to={`/stock/${encodeURIComponent(h.symbol)}`} className="flex min-h-12 flex-1 items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-semibold">{h.symbol}</span> <Pill>{h.account}</Pill>
                    <span className="block text-xs text-slate-500">
                      {h.shares} @ {money(h.costPerShare, h.currency)} · {h.market === 'CA' ? '🇨🇦' : '🇺🇸'} {h.currency}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums">
                    {h.error ? <span className="text-xs text-red-500">price unavailable</span> : money(h.value, h.currency)}
                    <span className={`block text-xs ${signColor(h.pl)}`}>
                      {money(h.pl, h.currency)} ({pct(h.plPct)})
                    </span>
                    {h.quoteMeta?.stale && <span className="block text-[10px] text-amber-500">stale</span>}
                  </span>
                </Link>
                <button
                  className="min-h-11 min-w-11 text-slate-400"
                  aria-label={`Delete ${h.symbol}`}
                  onClick={async () => {
                    if (confirm(`Remove ${h.symbol} from your portfolio?`)) {
                      await del(`/portfolio/holdings/${h.id}`);
                      reload();
                    }
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <H2>Add holding</H2>
      <Card>
        <form
          className="grid grid-cols-2 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post('/portfolio/holdings', { symbol: form.symbol.trim().toUpperCase(), shares: Number(form.shares), cost: Number(form.cost), account: form.account });
              setForm({ ...form, symbol: '', shares: '', cost: '' });
              setErr(null);
              reload();
            } catch (e2) {
              setErr((e2 as Error).message);
            }
          }}
        >
          <input className={`${input} col-span-2`} placeholder="Symbol (AAPL, RY.TO, SGD.V)" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} aria-label="Symbol" required />
          <input className={input} placeholder="Shares" inputMode="decimal" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} aria-label="Shares" required />
          <input className={input} placeholder="Cost / share" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} aria-label="Cost per share" required />
          <select className={`${input} col-span-2`} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} aria-label="Account">
            {(settings.data?.accounts ?? ['TFSA', 'RRSP', 'FHSA', 'Non-registered']).map((a: string) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <p className="col-span-2 text-xs text-slate-500">Currency is set from the listing: .TO/.V in CAD, US tickers in USD.</p>
          <button className={`${btnPrimary} col-span-2`}>Add</button>
        </form>
        {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
      </Card>

      {data.holdings.length > 0 && (
        <>
          <H2>Allocation</H2>
          <Card className="space-y-4">
            <AllocBars title="By sector" rows={data.allocation.sector} ccy={base} />
            <AllocBars title="By country" rows={data.allocation.country} ccy={base} />
            <AllocBars title="By currency" rows={data.allocation.currency} ccy={base} />
            <AllocBars title="By account" rows={data.allocation.account} ccy={base} />
          </Card>
        </>
      )}
      {data.taxNotes.length > 0 && (
        <Card className="mt-3">
          <h3 className="text-sm font-semibold">
            🧾 Account placement notes (<Term id="withholding">withholding</Term>)
          </h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {data.taxNotes.map((n: string) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">General information, not tax advice.</p>
        </Card>
      )}
    </div>
  );
}

function Risk() {
  const { data, error, loading, reload } = useApi('/portfolio/risk');
  if (loading && !data) return <Loading label="Crunching correlations…" />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return null;
  return (
    <div>
      <Card>
        <h2 className="text-sm font-semibold">Warnings</h2>
        {data.warnings.length === 0 ? (
          <p className="mt-1 text-sm text-green-600 dark:text-green-400">✓ No concentration or correlation warnings.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {data.warnings.map((w: string) => (
              <li key={w}>⚠️ {w}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-3">
        <Stat label={<Term id="drawdown">Hypothetical max drawdown (1y)</Term>} value={<span className="text-red-500">{data.maxDrawdown == null ? '—' : pct(data.maxDrawdown)}</span>} sub={data.drawdownNote} />
      </Card>
      {data.correlation && (
        <>
          <H2>Correlation (90 days)</H2>
          <Card className="overflow-x-auto">
            <table className="text-xs tabular-nums">
              <thead>
                <tr>
                  <th />
                  {data.correlation.symbols.map((s: string) => (
                    <th key={s} className="px-1 font-semibold">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.correlation.matrix.map((row: number[], i: number) => (
                  <tr key={i}>
                    <th className="pr-2 text-left font-semibold">{data.correlation.symbols[i]}</th>
                    {row.map((v, j) => (
                      <td key={j} className={`px-1 py-0.5 text-center ${i === j ? 'text-slate-400' : v > 0.85 ? 'bg-red-500/30' : v > 0.6 ? 'bg-amber-500/20' : ''}`}>
                        {v.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">1.0 = move identically, 0 = unrelated. Highly correlated holdings fall together.</p>
          </Card>
        </>
      )}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  price_above: 'Price above',
  price_below: 'Price below',
  signal_change: 'Signal changes',
  earnings: 'Earnings date',
  ex_dividend: 'Ex-dividend date',
  fund_filing: 'New 13F filing',
};

function Alerts() {
  const events = useApi<any[]>('/alerts/events');
  const rules = useApi<any[]>('/alerts/rules');
  return (
    <div>
      <H2
        right={
          <button
            className="min-h-10 text-xs text-sky-600 dark:text-sky-400"
            onClick={async () => {
              await post('/alerts/events/read');
              events.reload();
            }}
          >
            Mark all read
          </button>
        }
      >
        Inbox
      </H2>
      {events.loading && !events.data ? (
        <Loading />
      ) : events.error ? (
        <ErrorState error={events.error} />
      ) : events.data!.length === 0 ? (
        <Card className="text-sm text-slate-500">No alerts yet.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {events.data!.map((e) => (
              <li key={e.id} className={`px-4 py-2 text-sm ${e.read ? 'opacity-60' : ''}`}>
                {!e.read && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />}
                {e.symbol && (
                  <Link className="font-semibold" to={`/stock/${encodeURIComponent(e.symbol)}`}>
                    {e.symbol}{' '}
                  </Link>
                )}
                {e.message}
                <span className="block text-xs text-slate-500">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <H2>Active rules</H2>
      {rules.data && (
        <Card className="p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {rules.data.length === 0 && <li className="p-4 text-sm text-slate-500">No rules. Set alerts from any stock page or follow a fund.</li>}
            {rules.data.map((r) => (
              <li key={r.id} className="flex min-h-12 items-center justify-between px-4 text-sm">
                <span>
                  {KIND_LABEL[r.kind]} · <strong>{r.symbol ?? r.fund_name}</strong>
                  {r.threshold != null && ` @ ${r.threshold}`}
                  {!r.active && <Pill>fired</Pill>}
                  {r.last_triggered_at && <span className="block text-xs text-slate-500">last fired {date(r.last_triggered_at)}</span>}
                </span>
                <button
                  className="min-h-11 min-w-11 text-slate-400"
                  aria-label="Delete rule"
                  onClick={async () => {
                    await del(`/alerts/rules/${r.id}`);
                    rules.reload();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-2 text-xs text-slate-500">Price alerts are checked every 15 minutes during market hours; signals after each close; earnings/ex-dividend alerts fire 3 days ahead.</p>
    </div>
  );
}

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function Settings() {
  const { data, reload } = useApi('/settings');
  const [msg, setMsg] = useState<string | null>(null);
  if (!data) return <Loading />;
  const save = async (body: any) => {
    await put('/settings', body);
    reload();
  };
  const enablePush = async () => {
    try {
      if (!data.push.enabled) return setMsg('Push is not configured on the server (VAPID keys missing). Alerts still appear in the in-app inbox.');
      const reg = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setMsg('Notifications were not allowed.');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(data.push.publicKey) });
      await post('/push/subscribe', sub.toJSON());
      setMsg('Push notifications enabled on this device.');
    } catch (e) {
      setMsg(`Could not enable push: ${(e as Error).message}`);
    }
  };
  return (
    <div className="space-y-3">
      <Card>
        <h3 className="text-sm font-semibold">Base currency</h3>
        <div className="mt-2 flex gap-2">
          {(['CAD', 'USD'] as const).map((c) => (
            <button key={c} className={data.base_currency === c ? btnPrimary : btnGhost} onClick={() => save({ baseCurrency: c })}>
              {c}
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold">
          <Term id="position_size">Default risk per trade</Term>: {(data.risk_pct * 100).toFixed(2)}%
        </h3>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.25}
          defaultValue={data.risk_pct * 100}
          onMouseUp={(e) => save({ riskPct: Number((e.target as HTMLInputElement).value) / 100 })}
          onTouchEnd={(e) => save({ riskPct: Number((e.target as HTMLInputElement).value) / 100 })}
          onKeyUp={(e) => save({ riskPct: Number((e.target as HTMLInputElement).value) / 100 })}
          className="mt-2 w-full"
          aria-label="Default risk percent"
        />
        <p className="text-xs text-slate-500">1–2% is the common guideline. Used for the position-size suggestion on every signal.</p>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold">Push notifications</h3>
        <button className={`${btnGhost} mt-2`} onClick={enablePush}>
          🔔 Enable on this device
        </button>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
      </Card>
      <Disclaimer />
    </div>
  );
}
