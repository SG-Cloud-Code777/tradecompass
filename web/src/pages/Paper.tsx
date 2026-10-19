import { positionSize } from '@tradecompass/signals';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { SignalBadge } from '../components/SignalBadge';
import { btnGhost, btnPrimary, Card, ErrorState, H2, input, Loading, Stat } from '../components/ui';
import { api, post, useApi } from '../lib/api';
import { date, money, pct, signColor } from '../lib/format';
import { marketOf, useMarket } from '../lib/market';

export default function Paper() {
  const { market, setMarket } = useMarket();
  const [sp] = useSearchParams();
  const preset = sp.get('symbol');
  useEffect(() => {
    if (preset && marketOf(preset) !== market) setMarket(marketOf(preset));
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, error, loading, reload } = useApi(`/paper?market=${market}`);
  const ccy = market === 'US' ? 'USD' : 'CAD';

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => reload()} />;
  if (!data) return null;
  return (
    <div>
      <h1 className="text-xl font-bold">📝 Paper trading · {market === 'US' ? '🇺🇸 USD' : '🇨🇦 CAD'}</h1>
      <p className="text-xs text-slate-500">Virtual money. Orders fill at the latest (possibly 15-min delayed) quote. No shorting, no leverage.</p>
      <Card className="mt-3">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Equity" value={money(data.equity, ccy, 0)} sub={<span className={signColor(data.returnPct)}>{pct(data.returnPct)}</span>} />
          <Stat label="Cash" value={money(data.cash, ccy, 0)} />
          <Stat label="Closed trades" value={data.stats.closedTrades} sub={data.stats.winRate != null ? `${Math.round(data.stats.winRate * 100)}% winners` : undefined} />
        </div>
      </Card>
      <OrderTicket key={`${market}-${preset}`} preset={preset} cash={data.cash} equity={data.equity} ccy={ccy} onDone={reload} />

      <H2>Open positions</H2>
      <Card className="p-0">
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {data.positions.length === 0 && <li className="p-4 text-sm text-slate-500">No open positions.</li>}
          {data.positions.map((p: any) => (
            <li key={p.symbol} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
              <Link to={`/stock/${encodeURIComponent(p.symbol)}`} className="min-w-0">
                <span className="font-semibold">{p.symbol}</span>
                <span className="block text-xs text-slate-500">
                  {p.shares} @ {money(p.avg_cost, ccy)} · stop {p.stop ?? '—'} · target {p.target ?? '—'}
                </span>
              </Link>
              <span className="text-right tabular-nums">
                {money(p.value, ccy)}
                <span className={`block text-xs ${signColor(p.pl)}`}>{money(p.pl, ccy)}</span>
              </span>
              <button
                className={btnGhost}
                onClick={async () => {
                  try {
                    await post('/paper/order', { symbol: p.symbol, side: 'sell', shares: p.shares });
                  } catch (e) {
                    alert((e as Error).message);
                  }
                  reload();
                }}
              >
                Sell
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <H2>History</H2>
      <Card className="p-0">
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {data.trades.length === 0 && <li className="p-4 text-sm text-slate-500">No trades yet.</li>}
          {data.trades.map((t: any) => (
            <li key={t.id} className="flex justify-between px-4 py-2 text-sm">
              <span>
                <span className={t.side === 'buy' ? 'text-green-500' : 'text-red-500'}>{t.side.toUpperCase()}</span> {t.shares} {t.symbol} @ {money(t.price, ccy)}
                <span className="block text-xs text-slate-500">
                  {date(t.at)} · {t.reason}
                  {t.signal_label ? ` · signal was ${t.signal_label}` : ''}
                </span>
              </span>
              {t.realized_pl != null && <span className={`tabular-nums ${signColor(t.realized_pl)}`}>{money(t.realized_pl, ccy)}</span>}
            </li>
          ))}
        </ul>
      </Card>
      <button
        className={`${btnGhost} mt-4 w-full`}
        onClick={async () => {
          if (confirm('Reset this paper account to 100,000?')) {
            await post('/paper/reset', { market });
            reload();
          }
        }}
      >
        Reset paper account
      </button>
      <div className="mt-4">
        <Disclaimer compact />
      </div>
    </div>
  );
}

function OrderTicket({ preset, cash, equity, ccy, onDone }: { preset: string | null; cash: number; equity: number; ccy: string; onDone: () => void }) {
  const [symbol, setSymbol] = useState(preset ?? '');
  const [sig, setSig] = useState<any>(null);
  const [shares, setShares] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (s: string) => {
    setSig(null);
    setMsg(null);
    if (!s) return;
    try {
      const d = await api(`/signal/${encodeURIComponent(s)}`);
      setSig(d);
      const entry = (d.plan.entryLow + d.plan.entryHigh) / 2;
      const size = positionSize(equity, 0.01, entry, d.plan.stop, { cash });
      setShares(String(size.shares));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  useEffect(() => {
    if (preset) void load(preset);
  }, [preset]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="mt-3">
      <h2 className="text-sm font-semibold">New order</h2>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(symbol.trim().toUpperCase());
        }}
      >
        <input className={input} placeholder="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol" />
        <button className={btnGhost}>Check</button>
      </form>
      {sig && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{sig.symbol}</span>
            <SignalBadge label={sig.label} score={sig.score} />
          </div>
          {sig.plan.side !== 'long' && <p className="text-sm text-red-500">The rules say this is not a buy setup right now. You can still practise, but note why you're overriding the signal.</p>}
          <p className="text-xs text-slate-500">
            Plan: stop {sig.plan.stop} · target 1 {sig.plan.target1} · target 2 {sig.plan.target2}. Suggested size risks 1% of equity.
          </p>
          <div className="flex gap-2">
            <input className={input} inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} aria-label="Shares" />
            <button
              className={btnPrimary}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await post('/paper/order', { symbol: sig.symbol, side: 'buy', shares: Number(shares), stop: sig.plan.stop, target: sig.plan.target2, signalLabel: sig.label });
                  setMsg(`Filled ${shares} @ ${r.price}. Stop and target are monitored automatically.`);
                  onDone();
                } catch (e) {
                  setMsg((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Buy
            </button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm" role="status">{msg}</p>}
    </Card>
  );
}
