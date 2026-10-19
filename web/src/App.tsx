import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { input } from './components/ui';
import { api, useApi } from './lib/api';
import { money } from './lib/format';
import { useMarket } from './lib/market';
import Fund from './pages/Fund';
import Home from './pages/Home';
import Learn from './pages/Learn';
import Paper from './pages/Paper';
import Portfolio from './pages/Portfolio';
import Sectors from './pages/Sectors';
import SmartMoney from './pages/SmartMoney';
import Stock from './pages/Stock';

function MarketToggle() {
  const { market, setMarket } = useMarket();
  return (
    <div className="flex rounded-full bg-slate-200 p-1 text-sm font-semibold dark:bg-slate-800" role="radiogroup" aria-label="Market">
      {(['US', 'CA'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={market === m}
          onClick={() => setMarket(m)}
          className={`min-h-9 rounded-full px-3 transition ${market === m ? 'bg-white shadow dark:bg-slate-950' : 'text-slate-500'}`}
        >
          {m === 'US' ? '🇺🇸 US' : '🇨🇦 CA'}
        </button>
      ))}
    </div>
  );
}

function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 p-3 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg rounded-3xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="min-h-11 min-w-11 rounded-full text-xl" aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Search({ onDone }: { onDone: () => void }) {
  const { market } = useMarket();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ symbol: string; name: string; exchange: string; type: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  useEffect(() => {
    if (q.trim().length < 1) return setHits([]);
    const t = setTimeout(() => {
      api(`/search?q=${encodeURIComponent(q.trim())}&market=${market}`)
        .then((h) => (setHits(h), setErr(null)))
        .catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, market]);
  const go = (s: string) => {
    nav(`/stock/${encodeURIComponent(s)}`);
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) go(q.trim().toUpperCase());
      }}
    >
      <input autoFocus className={input} placeholder={market === 'US' ? 'Ticker or company (e.g. NVDA)' : 'Ticker or company (e.g. RY.TO)'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      <p className="mt-2 text-xs text-slate-500">Showing {market === 'US' ? 'US-listed' : 'TSX / TSXV'} results. Switch market with the toggle.</p>
      {err && <p className="mt-2 text-sm text-red-500">Search unavailable: {err}</p>}
      <ul className="mt-2 divide-y divide-slate-200 dark:divide-slate-800">
        {hits.map((h) => (
          <li key={h.symbol}>
            <button type="button" onClick={() => go(h.symbol)} className="flex min-h-12 w-full items-center justify-between text-left">
              <span>
                <span className="font-semibold">{h.symbol}</span> <span className="text-sm text-slate-500">{h.name}</span>
              </span>
              <span className="text-xs text-slate-500">
                {h.exchange} · {h.type}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}

function FxConverter() {
  const { data, error, loading } = useApi('/fx');
  const [amt, setAmt] = useState('1000');
  const [dir, setDir] = useState<'CAD' | 'USD'>('CAD');
  const v = Number(amt) || 0;
  if (loading) return <p className="text-sm text-slate-500">Loading rate…</p>;
  if (error || !data) return <p className="text-sm text-red-500">FX rate unavailable: {error?.message}</p>;
  const out = dir === 'CAD' ? v * data.cadToUsd : v * data.usdToCad;
  return (
    <div>
      <div className="flex gap-2">
        <input className={input} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount" />
        <button className="min-h-11 rounded-xl bg-slate-200 px-3 font-semibold dark:bg-slate-800" onClick={() => setDir(dir === 'CAD' ? 'USD' : 'CAD')}>
          {dir} ⇄
        </button>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{money(out, dir === 'CAD' ? 'USD' : 'CAD')}</p>
      <p className="mt-1 text-xs text-slate-500">
        1 CAD = {data.cadToUsd.toFixed(4)} USD · 1 USD = {data.usdToCad.toFixed(4)} CAD · {data.meta?.source}
        {data.meta?.stale ? ' · ⚠️ stale' : ''}
      </p>
      <p className="mt-2 text-xs text-slate-500">Mid-market rate. Brokers typically charge 1–2.5% to convert.</p>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: '🧭' },
  { to: '/sectors', label: 'Sectors', icon: '🗂️' },
  { to: '/smart-money', label: 'Big players', icon: '🐋' },
  { to: '/portfolio', label: 'Portfolio', icon: '💼' },
  { to: '/learn', label: 'Learn', icon: '🎓' },
];

export default function App() {
  const [sheet, setSheet] = useState<'search' | 'fx' | null>(null);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const loc = useLocation();
  const unread = useApi<any[]>('/alerts/events');
  useEffect(() => window.scrollTo(0, 0), [loc.pathname]);
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // ignore
    }
    setDark(next);
  };
  const unreadCount = unread.data?.filter((e) => !e.read).length ?? 0;
  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/90 px-4 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-center justify-between gap-2">
          <NavLink to="/" className="text-lg font-extrabold tracking-tight">
            Trade<span className="text-sky-500">Compass</span>
          </NavLink>
          <MarketToggle />
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setSheet('search')} className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-slate-200 px-3 text-left text-sm text-slate-500 dark:bg-slate-800">
            🔍 Search stocks & ETFs
          </button>
          <button onClick={() => setSheet('fx')} className="min-h-11 rounded-xl bg-slate-200 px-3 text-sm dark:bg-slate-800" aria-label="Currency converter">
            C$⇄US$
          </button>
          <NavLink to="/portfolio?tab=alerts" className="relative flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800" aria-label={`Alerts, ${unreadCount} unread`}>
            🔔
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{unreadCount}</span>}
          </NavLink>
          <button onClick={toggleTheme} className="min-h-11 min-w-11 rounded-xl bg-slate-200 dark:bg-slate-800" aria-label="Toggle dark mode">
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <main className="px-4 pt-3">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sectors" element={<Sectors />} />
          <Route path="/sectors/:sector" element={<Sectors />} />
          <Route path="/stock/:symbol" element={<Stock />} />
          <Route path="/smart-money" element={<SmartMoney />} />
          <Route path="/smart-money/funds/:id" element={<Fund />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:lesson" element={<Learn />} />
          <Route path="/paper" element={<Paper />} />
          <Route path="*" element={<p className="py-10 text-center text-slate-500">Page not found.</p>} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95" aria-label="Main">
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center text-[11px] ${isActive ? 'font-semibold text-sky-600 dark:text-sky-400' : 'text-slate-500'}`}
              >
                <span className="text-lg" aria-hidden>
                  {n.icon}
                </span>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Sheet open={sheet === 'search'} onClose={() => setSheet(null)} title="Search">
        <Search onDone={() => setSheet(null)} />
      </Sheet>
      <Sheet open={sheet === 'fx'} onClose={() => setSheet(null)} title="CAD ⇄ USD converter">
        <FxConverter />
      </Sheet>
    </div>
  );
}
