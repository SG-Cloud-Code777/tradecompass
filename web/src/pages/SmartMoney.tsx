import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Term } from '../components/Term';
import { btnGhost, btnPrimary, Card, ErrorState, H2, input, Loading, Pill } from '../components/ui';
import { post, useApi } from '../lib/api';
import { date, money } from '../lib/format';
import { useMarket } from '../lib/market';

export default function SmartMoney() {
  const { market } = useMarket();
  const funds = useApi<any[]>('/smart-money/funds');
  const clusters = useApi<any[]>(`/smart-money/insider-clusters?market=${market}`);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const follow = async (id: number, f: boolean) => {
    await post(`/smart-money/funds/${id}/follow`, { follow: f });
    funds.reload();
  };
  const refresh = async (id: number) => {
    setBusy(id);
    setMsg(null);
    try {
      const r = await post(`/smart-money/funds/${id}/refresh`);
      setMsg(`${r.fund}: ${r.newFilings} new filing(s) loaded.`);
      funds.reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold">🐋 Follow the big players</h1>
      <Card className="mt-3 border-amber-500/50 text-sm">
        <p className="font-semibold text-amber-700 dark:text-amber-300">Read this first</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">
          <li>
            <Term id="thirteen_f">13F filings</Term> arrive up to <strong>45 days after quarter end</strong> — positions can be 4+ months old and may already be sold.
          </li>
          <li>13Fs show only US-listed long positions: no shorts, hedges, options context, cash or most foreign holdings.</li>
          <li>
            <Term id="form4">Insider buys (Form 4)</Term> are reported within 2 business days and are the timeliest "smart money" signal. Canadian insiders file on <Term id="sedi">SEDI</Term>.
          </li>
          <li>Big funds are often wrong, and their position sizes, timeframes and risk limits are not yours. Copying them is not a guarantee.</li>
        </ul>
      </Card>

      <H2>{market === 'US' ? 'Insider cluster buying (US, 90 days)' : 'Insider activity (Canada)'}</H2>
      {market === 'CA' ? (
        <Card className="text-sm text-slate-600 dark:text-slate-300">
          SEDI has no public API, so Canadian insider clusters can't be computed automatically. Open any TSX stock for direct SEDI and SEDAR+ links. Interlisted Canadian companies
          also appear in US funds' 13F holdings below.
        </Card>
      ) : clusters.loading ? (
        <Loading />
      ) : clusters.error ? (
        <ErrorState error={clusters.error} />
      ) : clusters.data!.length === 0 ? (
        <Card className="text-sm text-slate-500">No stocks with 2+ insider buyers in the last 90 days among the stocks we've scanned. Form 4 data is refreshed daily for the US universe.</Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {clusters.data!.map((c) => (
              <li key={c.symbol}>
                <Link to={`/stock/${encodeURIComponent(c.symbol)}`} className="flex min-h-14 items-center justify-between px-4">
                  <span>
                    <span className="font-semibold">{c.symbol}</span> <span className="text-xs text-slate-500">{c.name}</span>
                  </span>
                  <span className="text-right text-sm">
                    <Pill tone="green">{c.buyers} insiders bought</Pill>
                    <span className="block text-xs text-slate-500">
                      {money(c.value, 'USD', 0)} · last {date(c.last_buy)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <H2>Institutional managers (13F)</H2>
      {msg && <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">{msg}</p>}
      {funds.loading && !funds.data ? (
        <Loading />
      ) : funds.error ? (
        <ErrorState error={funds.error} />
      ) : (
        <div className="space-y-2">
          {funds.data!.map((f) => (
            <Card key={f.id} className="flex items-center justify-between gap-2">
              <Link to={`/smart-money/funds/${f.id}`} className="min-w-0 flex-1">
                <span className="font-semibold">{f.name}</span> {f.country === 'CA' && '🇨🇦'}
                <span className="block text-xs text-slate-500">
                  {f.style} · {f.period ? `Q ending ${date(f.period)}, filed ${date(f.filed)} · ${money(Number(f.total_value), 'USD', 0)}` : 'not loaded yet'}
                </span>
              </Link>
              <div className="flex shrink-0 flex-col gap-1">
                <button className={f.followed ? btnPrimary : btnGhost} onClick={() => follow(f.id, !f.followed)} aria-pressed={f.followed}>
                  {f.followed ? '🔔 Following' : 'Follow'}
                </button>
                <button className="min-h-9 text-xs text-sky-600 dark:text-sky-400" disabled={busy === f.id} onClick={() => refresh(f.id)}>
                  {busy === f.id ? 'Loading from EDGAR…' : '↻ Load latest 13F'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <AddFund onAdded={() => funds.reload()} />
    </div>
  );
}

function AddFund({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [cik, setCik] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="mt-4">
      <h3 className="text-sm font-semibold">Track another 13F filer</h3>
      <p className="text-xs text-slate-500">
        Find the CIK on{' '}
        <a className="text-sky-600 dark:text-sky-400" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR" target="_blank" rel="noreferrer">
          EDGAR company search ↗
        </a>{' '}
        (e.g. Canadian pension plans and banks that file 13F).
      </p>
      <form
        className="mt-2 grid grid-cols-[1fr_7rem] gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post('/smart-money/funds', { name, cik });
            setName('');
            setCik('');
            setErr(null);
            onAdded();
          } catch (e2) {
            setErr((e2 as Error).message);
          }
        }}
      >
        <input className={input} placeholder="Fund name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Fund name" />
        <input className={input} placeholder="CIK" inputMode="numeric" value={cik} onChange={(e) => setCik(e.target.value)} aria-label="CIK" />
        <button className={`${btnGhost} col-span-2`}>Add fund</button>
      </form>
      {err && <p className="mt-1 text-sm text-red-500">{err}</p>}
    </Card>
  );
}
