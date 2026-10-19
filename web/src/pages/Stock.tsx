import { positionSize, type Bar } from '@tradecompass/signals';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { PriceChart } from '../components/PriceChart';
import { labelTone, ScoreBar, SignalBadge } from '../components/SignalBadge';
import { Term } from '../components/Term';
import { btnGhost, btnPrimary, Card, DataStatus, ErrorState, H2, input, Loading, Pill, Stat } from '../components/ui';
import { post, useApi } from '../lib/api';
import { date, money, num, pct, signColor } from '../lib/format';
import { marketOf, useMarket } from '../lib/market';

const FACTOR_NAMES: Record<string, { name: string; term: string }> = {
  trend: { name: 'Trend', term: 'ma' },
  momentum: { name: 'Momentum', term: 'rsi' },
  volume: { name: 'Volume', term: 'volume' },
  levels: { name: 'Volatility & levels', term: 'bollinger' },
  fundamentals: { name: 'Fundamentals', term: 'pe' },
  macro: { name: 'Macro', term: 'macro' },
  smartMoney: { name: 'Smart money', term: 'form4' },
};

export default function Stock() {
  const symbol = decodeURIComponent(useParams().symbol ?? '').toUpperCase();
  const { market, setMarket } = useMarket();
  useEffect(() => {
    // Keep the US/CA separation strict: viewing a stock switches the app to its market.
    if (marketOf(symbol) !== market) setMarket(marketOf(symbol));
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const sig = useApi(`/signal/${encodeURIComponent(symbol)}`);
  const bars = useApi<{ bars: Bar[]; meta: any }>(`/bars/${encodeURIComponent(symbol)}?days=1300`);
  const quote = useApi(`/quote/${encodeURIComponent(symbol)}`);
  const s = sig.data;

  const levels = useMemo(
    () =>
      s && s.plan.side !== 'long'
        ? [{ price: s.plan.stop, title: 'Exit', color: '#dc2626' }]
        : s
        ? [
            { price: s.plan.stop, title: 'Stop', color: '#dc2626' },
            { price: s.plan.entryLow, title: 'Entry', color: '#38bdf8' },
            { price: s.plan.target1, title: 'T1', color: '#16a34a' },
            { price: s.plan.target2, title: 'T2', color: '#15803d' },
          ]
        : [],
    [s],
  );

  if (sig.loading && !s) return <Loading label={`Analysing ${symbol}…`} />;
  if (sig.error) return <ErrorState error={sig.error} onRetry={() => sig.reload()} />;
  if (!s) return null;
  const q = quote.data;
  const ccy = s.currency;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{s.symbol}</h1>
          <p className="truncate text-sm text-slate-500">
            {s.name} · {s.exchange} · {s.market === 'US' ? '🇺🇸' : '🇨🇦'} {ccy}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {s.kind === 'etf' && <Pill tone="sky">ETF</Pill>}
            {s.kind === 'reit' && <Pill tone="sky">REIT</Pill>}
            {s.flags.cadHedged && <Pill tone="sky">CAD-hedged</Pill>}
            {s.flags.venture && <Pill tone="amber">TSXV junior</Pill>}
            {s.flags.leveraged && <Pill tone="red">Leveraged ETF</Pill>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">{money(q?.price ?? s.snapshot.close, ccy)}</div>
          <div className={`text-sm tabular-nums ${signColor(q?.changePct)}`}>{pct(q?.changePct, 2)} today</div>
        </div>
      </div>
      <DataStatus meta={q?.meta} label="Quote" />
      {quote.error && <p className="text-xs text-red-500">Live quote unavailable — showing last close.</p>}

      <div className="mt-3">
        <Disclaimer />
      </div>

      <SignalCard s={s} onRefresh={() => sig.reload('refresh=true')} refreshing={sig.loading} />

      <Card className="mt-4 p-2">
        {bars.loading && !bars.data ? <Loading label="Loading chart…" /> : bars.data ? <PriceChart bars={bars.data.bars} levels={levels} /> : bars.error && <ErrorState error={bars.error} />}
        <p className="px-2 pb-1 text-[11px] text-slate-500">
          <span className="text-sky-400">━ MA50</span> · <span className="text-violet-400">━ MA200</span> · dashed: entry, stop, targets
        </p>
      </Card>

      <TradePlan s={s} />
      <Checklist s={s} />
      <Factors s={s} />
      <Backtest bt={s.backtest} ccy={ccy} />
      <Fundamentals s={s} />
      <SmartMoney symbol={s.symbol} />
      <News symbol={s.symbol} />
      <ActionBar s={s} />
      <div className="mt-6">
        <Disclaimer />
      </div>
    </div>
  );
}

function SignalCard({ s, onRefresh, refreshing }: { s: any; onRefresh: () => void; refreshing: boolean }) {
  const tone = labelTone(s.label);
  const border = tone === 'buy' ? 'border-green-600/60' : tone === 'sell' ? 'border-red-600/60' : 'border-amber-500/60';
  return (
    <Card className={`mt-4 border-2 ${border}`}>
      <div className="flex items-center justify-between">
        <SignalBadge label={s.label} score={s.score} size="lg" />
        <span className="text-right text-xs text-slate-500">
          <Term id="confidence">{s.confidence.level} confidence</Term>
          <span className="block">
            {Math.round(s.confidence.coverage * 100)}% data · {Math.round(s.confidence.agreement * 100)}% agreement
          </span>
        </span>
      </div>
      <div className="mb-6 mt-3">
        <ScoreBar score={s.score} />
      </div>
      <h3 className="text-sm font-semibold">Top reasons</h3>
      <ol className="mt-1 space-y-1.5">
        {s.topReasons.map((r: any, i: number) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className={`w-12 shrink-0 text-right font-mono tabular-nums ${r.points >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {r.points >= 0 ? '+' : ''}
              {r.points.toFixed(1)}
            </span>
            <span>{r.text}</span>
          </li>
        ))}
        {s.topReasons.length === 0 && <li className="text-sm text-slate-500">Factors are mixed — no single strong reason.</li>}
      </ol>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          As of close {date(s.asOf)} · computed {new Date(s.meta.computedAt).toLocaleString()}
        </span>
        <button onClick={onRefresh} disabled={refreshing} className="min-h-10 rounded-lg px-2 text-sky-600 dark:text-sky-400">
          {refreshing ? 'Refreshing…' : '↻ Recompute'}
        </button>
      </div>
      <DataStatus meta={s.meta.bars} label="Prices" />
      {s.meta.fundamentals?.stale && <p className="text-xs text-amber-600 dark:text-amber-300">Fundamentals unavailable or stale — the fundamentals factor may be excluded.</p>}
    </Card>
  );
}

function TradePlan({ s }: { s: any }) {
  const settings = useApi('/settings');
  const [portfolio, setPortfolio] = useState('100000');
  const [risk, setRisk] = useState(1);
  useEffect(() => {
    if (settings.data?.risk_pct) setRisk(settings.data.risk_pct * 100);
  }, [settings.data]);
  const p = s.plan;
  const long = p.side === 'long';
  const entry = (p.entryLow + p.entryHigh) / 2;
  const size = positionSize(Number(portfolio) || 0, risk / 100, entry, p.stop);
  const ccy = s.currency;
  return (
    <>
      <H2>{long ? 'Trade plan' : 'Exit plan (if you already own it)'}</H2>
      {!long && (
        <p className="mb-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          This is not a buy setup. TradeCompass never suggests short selling — for holders, the levels below show where the rules say to exit or reduce.
        </p>
      )}
      {s.label === 'HOLD' && <p className="mb-2 text-sm text-slate-500">HOLD: no fresh entry signal. If you own it, follow the hold/sell rules; if not, waiting for a BUY or a pullback to the entry zone is the rule-based choice.</p>}
      {!long && (
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Last close" value={num(s.snapshot.close)} sub={ccy} />
            <Stat label="Exit if a close below" value={<span className="text-red-500">{num(p.stop)}</span>} sub={pct(p.stop / s.snapshot.close - 1)} />
            <Stat label={<Term id="ma">50-day MA</Term>} value={num(s.snapshot.sma50)} sub="trend line to reclaim" />
            <Stat label={<Term id="ma">200-day MA</Term>} value={num(s.snapshot.sma200)} />
            <Stat label={<Term id="atr">ATR (14)</Term>} value={num(s.snapshot.atr14)} sub="typical daily range" />
          </div>
        </Card>
      )}
      {long && <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Entry zone" value={`${num(p.entryLow)}–${num(p.entryHigh)}`} sub={ccy} />
          <Stat label={<Term id="stop_loss">Stop-loss</Term>} value={<span className="text-red-500">{num(p.stop)}</span>} sub={pct(p.stop / entry - 1)} />
          <Stat label={<Term id="risk_reward">Risk/reward</Term>} value={`${p.riskReward.toFixed(1)} : 1`} sub={p.riskReward < 1.5 ? 'below 1.5 — weak' : 'to target 1'} />
          <Stat label="Target 1" value={<span className="text-green-500">{num(p.target1)}</span>} sub={pct(p.target1 / entry - 1)} />
          <Stat label="Target 2" value={<span className="text-green-500">{num(p.target2)}</span>} sub={pct(p.target2 / entry - 1)} />
          <Stat label={<Term id="atr">ATR (14)</Term>} value={num(s.snapshot.atr14)} sub="typical daily range" />
        </div>
      </Card>}

      {long && (
        <Card className="mt-3">
          <h3 className="text-sm font-semibold">
            <Term id="position_size">Suggested position size</Term>
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Portfolio ({ccy})
              <input className={input} inputMode="decimal" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} />
            </label>
            <label className="text-xs text-slate-500">
              Risk per trade: <strong>{risk.toFixed(2)}%</strong>
              <input type="range" min={0.25} max={3} step={0.25} value={risk} onChange={(e) => setRisk(Number(e.target.value))} className="mt-3 w-full" aria-label="Risk percent per trade" />
            </label>
          </div>
          <p className="mt-3 text-lg font-bold tabular-nums">
            {size.shares.toLocaleString()} shares ≈ {money(size.positionValue, ccy)}
          </p>
          <p className="text-xs text-slate-500">
            If the stop is hit you lose about {money(size.riskAmount, ccy)} ({risk.toFixed(2)}% of the portfolio) — more if the price gaps through the stop.
            {size.cappedBy === 'maxAllocation' && ' Capped at 25% of the portfolio in one position.'}
          </p>
          {risk > 2 && <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">⚠️ Above 2% per trade, a normal losing streak can do serious damage.</p>}
        </Card>
      )}

      {long && (
        <Card className="mt-3 border-amber-500/50">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">⚠️ Risks</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {p.risks.map((r: string) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className={`mt-3 grid gap-3 ${long ? 'sm:grid-cols-2' : ''}`}>
        {long && <Card>
          <h3 className="text-sm font-semibold text-green-600 dark:text-green-400">✋ Hold until…</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {p.holdUntil.map((r: string) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>}
        <Card>
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">🚪 {long ? 'Sell if…' : 'Exit / reduce if you hold it…'}</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {p.sellIf.filter((r: string) => long || !r.startsWith('Target reached')).map((r: string) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-3">
        <h3 className="text-sm font-semibold">❌ {long ? 'What would prove this wrong' : 'What would invalidate the SELL'}</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {p.invalidation.map((r: string) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {!long && (
          <>
            <h3 className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">Risks</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {p.risks.map((r: string) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}

function Checklist({ s }: { s: any }) {
  const sn = s.snapshot;
  const f = s.fundamentals;
  const items: { ok: boolean | null; text: string }[] = [
    { ok: sn.sma200 != null ? sn.close > sn.sma200 : null, text: 'Price above the 200-day moving average (long-term uptrend)' },
    { ok: sn.sma50 != null && sn.sma200 != null ? sn.sma50 > sn.sma200 : null, text: '50-day above 200-day (no death cross)' },
    { ok: sn.rsi14 != null ? sn.rsi14 < 70 : null, text: 'RSI not overbought (below 70)' },
    { ok: sn.macdHist != null ? sn.macdHist > 0 : null, text: 'MACD above its signal line' },
    { ok: s.plan.riskReward >= 1.5, text: 'Risk/reward at least 1.5 : 1' },
    { ok: sn.avgDollarVolume20 != null ? sn.avgDollarVolume20 >= 1_000_000 : null, text: 'Liquid: over $1M traded per day' },
    { ok: s.events.daysToEarnings == null ? null : !(s.events.daysToEarnings >= 0 && s.events.daysToEarnings <= 14), text: 'No earnings report in the next 2 weeks' },
    { ok: f && s.kind !== 'etf' ? (f.freeCashFlow ?? 0) > 0 || (f.revenueGrowth ?? 0) > 0 : null, text: 'Fundamentals healthy (positive free cash flow or growing revenue)' },
    { ok: s.confidence.level !== 'Low', text: 'Signal confidence is Medium or High' },
    { ok: null, text: 'I know my exit price and position size BEFORE buying' },
  ];
  const passed = items.filter((i) => i.ok === true).length;
  const known = items.filter((i) => i.ok !== null).length;
  return (
    <>
      <H2 right={<span className="text-xs text-slate-500">{passed}/{known} automatic checks pass</span>}>Buy / Hold / Sell checklist</H2>
      <Card className="p-0">
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {items.map((i) => (
            <li key={i.text} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
              <span aria-hidden className="w-5 text-center">
                {i.ok === true ? '✅' : i.ok === false ? '❌' : '⬜'}
              </span>
              <span>
                {i.text}
                <span className="sr-only">{i.ok === true ? ' — pass' : i.ok === false ? ' — fail' : ' — check yourself'}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Factors({ s }: { s: any }) {
  return (
    <>
      <H2 right={<Term id="score">How scoring works</Term>}>Why this signal — every factor</H2>
      <div className="space-y-2">
        {s.factors.map((f: any) => {
          const pts = f.reasons.reduce((a: number, r: any) => a + r.points, 0);
          return (
            <details key={f.factor} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4">
                <span className="text-sm font-semibold">
                  {FACTOR_NAMES[f.factor].name} <span className="font-normal text-slate-500">· weight {f.weight || '—'}</span>
                </span>
                <span className={`font-mono text-sm tabular-nums ${!f.available ? 'text-slate-500' : pts >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {f.available ? `${pts >= 0 ? '+' : ''}${pts.toFixed(1)}` : 'no data'}
                </span>
              </summary>
              <div className="px-4 pb-3">
                {f.available ? (
                  <ul className="space-y-1 text-sm">
                    {f.reasons.map((r: any, i: number) => (
                      <li key={i} className="flex gap-2">
                        <span className={`w-12 shrink-0 text-right font-mono text-xs tabular-nums ${r.points >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {r.points >= 0 ? '+' : ''}
                          {r.points.toFixed(1)}
                        </span>
                        {r.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Not enough data — this factor is excluded and the others are re-weighted (lower confidence).</p>
                )}
                <p className="mt-2 text-xs">
                  <Term id={FACTOR_NAMES[f.factor].term}>Learn about {FACTOR_NAMES[f.factor].name.toLowerCase()}</Term>
                </p>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}

function Equity({ points }: { points: { t: number; v: number }[] }) {
  if (points.length < 2) return null;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * 300).toFixed(1)},${(60 - ((p.v - min) / (max - min || 1)) * 56 - 2).toFixed(1)}`).join(' ');
  const base = 60 - ((1 - min) / (max - min || 1)) * 56 - 2;
  return (
    <svg viewBox="0 0 300 60" className="mt-2 h-16 w-full" role="img" aria-label="Backtest equity curve">
      {base >= 0 && base <= 60 && <line x1="0" x2="300" y1={base} y2={base} className="stroke-slate-400" strokeDasharray="3 3" strokeWidth="0.5" />}
      <path d={d} fill="none" className={vs[vs.length - 1] >= 1 ? 'stroke-green-500' : 'stroke-red-500'} strokeWidth="1.5" />
    </svg>
  );
}

function Backtest({ bt, ccy }: { bt: any; ccy: string }) {
  void ccy;
  return (
    <>
      <H2 right={<Term id="backtest">How we test</Term>}>Backtest — honest results</H2>
      <Card>
        {bt.tradeCount === 0 ? (
          <p className="text-sm text-slate-500">Not enough history or no signals triggered in the test period.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {date(new Date(bt.from * 1000).toISOString())} → {date(new Date(bt.to * 1000).toISOString())} · technical rules only · long-only · {(bt.costPerSide * 100).toFixed(1)}% cost per side
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat label={<Term id="win_rate">Win rate</Term>} value={pct(bt.winRate, 0, false)} sub={`${bt.tradeCount} trades`} />
              <Stat label="Avg gain" value={<span className="text-green-500">{pct(bt.avgGain)}</span>} />
              <Stat label="Avg loss" value={<span className="text-red-500">{pct(bt.avgLoss)}</span>} />
              <Stat label="Strategy" value={<span className={signColor(bt.totalReturn)}>{pct(bt.totalReturn)}</span>} sub={`in market ${pct(bt.exposure, 0, false)}`} />
              <Stat label="Buy & hold" value={<span className={signColor(bt.buyHoldReturn)}>{pct(bt.buyHoldReturn)}</span>} />
              <Stat label={<Term id="drawdown">Max drawdown</Term>} value={<span className="text-red-500">{pct(bt.maxDrawdown)}</span>} />
            </div>
            <Equity points={bt.equity} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bt.yearly.map((y: any) => (
                <span key={y.year} className={`rounded-lg px-2 py-1 text-xs tabular-nums ${y.ret < 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-green-500/15 text-green-700 dark:text-green-400'}`}>
                  {y.year}: {pct(y.ret)}
                </span>
              ))}
            </div>
            {bt.worstTrade && (
              <p className="mt-2 text-xs text-slate-500">
                Worst trade: {pct(bt.worstTrade.ret)} ({date(new Date(bt.worstTrade.entryT * 1000).toISOString())}, exit by {bt.worstTrade.exitReason}).
              </p>
            )}
            <details className="mt-2">
              <summary className="min-h-10 cursor-pointer text-sm text-sky-600 dark:text-sky-400">Recent trades</summary>
              <table className="mt-1 w-full text-xs tabular-nums">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left">Entry</th>
                    <th className="text-right">In</th>
                    <th className="text-right">Out</th>
                    <th className="text-right">Return</th>
                    <th className="text-right">Exit</th>
                  </tr>
                </thead>
                <tbody>
                  {bt.trades.map((t: any) => (
                    <tr key={t.entryT}>
                      <td>{new Date(t.entryT * 1000).toISOString().slice(0, 10)}</td>
                      <td className="text-right">{num(t.entry)}</td>
                      <td className="text-right">{num(t.exit)}</td>
                      <td className={`text-right ${signColor(t.ret)}`}>{pct(t.ret)}</td>
                      <td className="text-right">{t.exitReason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Backtests are hypothetical and look better than real trading (no slippage beyond the cost above, perfect discipline). Losing periods above are real results of these rules. Past performance doesn't guarantee future results.
        </p>
      </Card>
    </>
  );
}

function Fundamentals({ s }: { s: any }) {
  const f = s.fundamentals;
  const sn = s.snapshot;
  return (
    <>
      <H2>Key numbers</H2>
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label={<Term id="rsi">RSI (14)</Term>} value={num(sn.rsi14, 0)} />
          <Stat label={<Term id="ma">50-day MA</Term>} value={num(sn.sma50)} />
          <Stat label={<Term id="ma">200-day MA</Term>} value={num(sn.sma200)} />
          <Stat label={<Term id="week52">52-week range</Term>} value={`${num(sn.low52w)}–${num(sn.high52w)}`} />
          <Stat label={<Term id="support">Support / resistance</Term>} value={`${num(sn.support)} / ${num(sn.resistance)}`} />
          <Stat label={<Term id="volume">Volume vs avg</Term>} value={sn.volumeRatio != null ? `${sn.volumeRatio.toFixed(1)}×` : '—'} />
        </div>
        {f ? (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 sm:grid-cols-3">
            {s.kind === 'reit' && <p className="col-span-full text-xs text-slate-500">REIT: judge on <Term id="ffo">FFO, P/FFO and occupancy</Term> (not reported by our free data source — check the REIT's quarterly report).</p>}
            <Stat label={<Term id="pe">P/E</Term>} value={num(f.pe, 1)} sub={f.sectorPe ? `sector median ${num(f.sectorPe, 1)}` : undefined} />
            <Stat label={<Term id="eps_growth">EPS growth</Term>} value={pct(f.epsGrowth, 0)} />
            <Stat label={<Term id="revenue_growth">Revenue growth</Term>} value={pct(f.revenueGrowth, 0)} />
            <Stat label={<Term id="de">Debt / equity</Term>} value={num(f.debtToEquity)} />
            <Stat label={<Term id="fcf">Free cash flow</Term>} value={money(f.freeCashFlow, s.currency, 0)} />
            <Stat label={<Term id="pb">P/B</Term>} value={num(f.priceToBook)} />
            <Stat label={<Term id="yield">Dividend yield</Term>} value={pct(f.dividendYield, 2, false)} />
            <Stat label={<Term id="payout">Payout ratio</Term>} value={pct(f.payoutRatio, 0, false)} />
            <Stat label="Market cap" value={money(f.marketCap, s.currency, 0)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">{s.kind === 'etf' ? 'ETF — company fundamentals don\'t apply. Check the fund\'s MER, holdings and tracking.' : 'Fundamentals unavailable from the data provider.'}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
          <Pill tone={s.events.daysToEarnings != null && s.events.daysToEarnings <= 14 && s.events.daysToEarnings >= 0 ? 'amber' : 'slate'}>📅 Earnings: {date(s.events.earningsDate)}</Pill>
          <Pill>💵 Ex-dividend: {date(s.events.exDividendDate)}</Pill>
        </div>
        <DataStatus meta={s.meta.fundamentals} label="Fundamentals" />
      </Card>
    </>
  );
}

function SmartMoney({ symbol }: { symbol: string }) {
  const { data, error, loading } = useApi(`/smart-money/stock/${encodeURIComponent(symbol)}`);
  return (
    <>
      <H2 right={<Link className="text-xs text-sky-600 dark:text-sky-400" to="/smart-money">All big players →</Link>}>Smart money</H2>
      <Card>
        {loading && <Loading label="Checking filings…" />}
        {error && <p className="text-sm text-red-500">Filings unavailable: {error.message}</p>}
        {data && (
          <div className="space-y-4">
            <p className="rounded-xl bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">⏱ {data.disclaimer}</p>
            <section>
              <h3 className="text-sm font-semibold">
                <Term id="thirteen_f">Tracked funds (13F)</Term>
              </h3>
              {data.funds.holders.length === 0 ? (
                <p className="text-sm text-slate-500">None of the tracked funds report this holding in their latest two 13F filings.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {data.funds.holders.map((h: any) => (
                    <li key={h.fundId} className="flex justify-between gap-2">
                      <Link to={`/smart-money/funds/${h.fundId}`} className="underline-offset-2 hover:underline">
                        {h.fund}
                      </Link>
                      <span className="text-right">
                        <Pill tone={h.status === 'new' || h.status === 'added' ? 'green' : h.status === 'held' ? 'slate' : 'red'}>{h.status}</Pill>{' '}
                        <span className="text-xs text-slate-500">
                          {money(h.value, 'USD', 0)} · Q end {date(h.period)} ({h.dataAgeDays}d old)
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {data.market === 'US' && data.insiders && (
              <section>
                <h3 className="text-sm font-semibold">
                  <Term id="form4">Insider trades (Form 4)</Term>
                  {data.insiders.cluster && <Pill tone="green">Cluster buying</Pill>}
                </h3>
                <p className="text-xs text-slate-500">
                  Last 90 days: {data.insiders.buyers90d} insider buyer(s) ({money(data.insiders.buyValue90d, 'USD', 0)}) · {data.insiders.sellers90d} seller(s) ({money(data.insiders.sellValue90d, 'USD', 0)})
                </p>
                {data.insiders.error && <p className="text-xs text-amber-600">Latest refresh failed: {data.insiders.error}</p>}
                <ul className="mt-1 divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  {data.insiders.trades
                    .filter((t: any) => t.code === 'P' || t.code === 'S')
                    .slice(0, 8)
                    .map((t: any, i: number) => (
                      <li key={i} className="flex justify-between gap-2 py-1">
                        <span className="min-w-0 truncate">
                          {t.insider} <span className="text-xs text-slate-500">· {t.role}</span>
                        </span>
                        <span className={`shrink-0 tabular-nums ${t.code === 'P' ? 'text-green-500' : 'text-red-500'}`}>
                          {t.code === 'P' ? 'Bought' : 'Sold'} {num(t.shares, 0)} @ {num(t.price)} · {date(t.txn_date)}
                        </span>
                      </li>
                    ))}
                </ul>
                {data.insiders.edgarUrl && (
                  <a className="text-xs text-sky-600 dark:text-sky-400" href={data.insiders.edgarUrl} target="_blank" rel="noreferrer">
                    All filings on SEC EDGAR ↗
                  </a>
                )}
              </section>
            )}
            {data.market === 'US' && (
              <section>
                <h3 className="text-sm font-semibold">
                  <Term id="thirteen_dg">13D / 13G (5%+ stakes)</Term>
                </h3>
                {data.ownership.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent 13D/13G filings found.</p>
                ) : (
                  <ul className="text-sm">
                    {data.ownership.slice(0, 6).map((o: any) => (
                      <li key={o.url}>
                        <a href={o.url} target="_blank" rel="noreferrer" className="text-sky-600 dark:text-sky-400">
                          {o.form} · {date(o.filed)} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {data.market === 'US' && data.congress && (
              <section>
                <h3 className="text-sm font-semibold">Congressional trades</h3>
                {data.congress.available ? (
                  data.congress.trades.length ? (
                    <ul className="text-sm">
                      {data.congress.trades.slice(0, 8).map((t: any, i: number) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate">
                            {t.member} <span className="text-xs text-slate-500">({t.chamber})</span>
                          </span>
                          <span className="shrink-0 text-xs">
                            {t.type} {t.amount} · traded {date(t.transactionDate)}, disclosed {date(t.disclosureDate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No disclosed trades.</p>
                  )
                ) : (
                  <p className="text-sm text-slate-500">{data.congress.reason ?? data.congress.error} Official sources:</p>
                )}
                <p className="text-xs">
                  {data.congress.sources.map((s: any) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="mr-3 text-sky-600 dark:text-sky-400">
                      {s.name} ↗
                    </a>
                  ))}
                </p>
              </section>
            )}
            {data.market === 'CA' && (
              <section>
                <h3 className="text-sm font-semibold">
                  🇨🇦 <Term id="sedi">Canadian insider & filings</Term>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">{data.canada.note}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {data.canada.links.map((l: any) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-sky-600 dark:text-sky-400">
                        {l.name} ↗
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">{data.canada.pensionNote}</p>
              </section>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

function News({ symbol }: { symbol: string }) {
  const { data, error, loading } = useApi(`/news/${encodeURIComponent(symbol)}`);
  return (
    <>
      <H2>News</H2>
      <Card className="p-0">
        {loading && <div className="px-4"><Loading label="Loading news…" /></div>}
        {error && <p className="p-4 text-sm text-red-500">News unavailable: {error.message}</p>}
        {data && (
          <>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.data.length === 0 && <li className="p-4 text-sm text-slate-500">No recent headlines.</li>}
              {data.data.map((n: any) => (
                <li key={n.url}>
                  <a href={n.url} target="_blank" rel="noreferrer" className="block min-h-12 px-4 py-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {n.source} · {date(n.publishedAt)}
                      {n.sentimentLabel && <Pill tone={n.sentiment > 0.15 ? 'green' : n.sentiment < -0.15 ? 'red' : 'slate'}>{n.sentimentLabel}</Pill>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="px-4 pb-3">
              <DataStatus meta={data.meta} label="News" />
              <p className="text-[11px] text-slate-500">Sentiment scores are machine-generated and are not part of the signal score.</p>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function ActionBar({ s }: { s: any }) {
  const nav = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [alertPrice, setAlertPrice] = useState('');
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <>
      <H2>Actions</H2>
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <button className={btnGhost} onClick={() => act(() => post('/watchlist', { symbol: s.symbol }), 'Added to watchlist — you\'ll be alerted if the signal changes.')}>
            ☆ Watch
          </button>
          <button className={btnPrimary} onClick={() => nav(`/paper?symbol=${encodeURIComponent(s.symbol)}`)}>
            📝 Paper trade
          </button>
          <button className={btnGhost} onClick={() => act(() => post('/alerts/rules', { kind: 'earnings', symbol: s.symbol }), 'Earnings alert set.')}>
            📅 Earnings alert
          </button>
          <button className={btnGhost} onClick={() => act(() => post('/alerts/rules', { kind: 'ex_dividend', symbol: s.symbol }), 'Ex-dividend alert set.')}>
            💵 Ex-div alert
          </button>
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(alertPrice);
            if (!(v > 0)) return setMsg('Enter a price.');
            const kind = v >= s.snapshot.close ? 'price_above' : 'price_below';
            act(() => post('/alerts/rules', { kind, symbol: s.symbol, threshold: v }), `Alert set: ${kind === 'price_above' ? 'above' : 'below'} ${v}.`);
          }}
        >
          <input className={input} inputMode="decimal" placeholder={`Price alert (${s.currency})`} value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} aria-label="Alert price" />
          <button className={btnGhost}>🔔 Set</button>
        </form>
        {msg && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" role="status">{msg}</p>}
      </Card>
    </>
  );
}
