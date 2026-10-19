import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Disclaimer } from '../components/Disclaimer';
import { Term } from '../components/Term';
import { Card, H2, input } from '../components/ui';
import { GLOSSARY } from '../content/glossary';
import { LESSONS } from '../content/lessons';
import { CountryNotes } from './Sectors';

export default function Learn() {
  const { lesson } = useParams();
  const [q, setQ] = useState('');
  const l = LESSONS.find((x) => x.id === lesson);
  if (l)
    return (
      <article>
        <Link to="/learn" className="text-sm text-sky-600 dark:text-sky-400">
          ← All lessons
        </Link>
        <h1 className="mt-1 text-xl font-bold">{l.title}</h1>
        <p className="text-xs text-slate-500">{l.minutes} min read</p>
        {l.sections.map((s) => (
          <section key={s.h} className="mt-4">
            <h2 className="font-semibold">{s.h}</h2>
            <p className="mt-1 leading-relaxed text-slate-700 dark:text-slate-300">{s.p}</p>
          </section>
        ))}
        {l.terms && (
          <Card className="mt-5">
            <h2 className="text-sm font-semibold">Tap to explain</h2>
            <ul className="mt-1 flex flex-wrap gap-3 text-sm">
              {l.terms.map((t) => (
                <li key={t}>
                  <Term id={t} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        <div className="mt-5">
          <Disclaimer compact />
        </div>
      </article>
    );

  const terms = Object.entries(GLOSSARY).filter(([, t]) => !q || `${t.title} ${t.short}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <h1 className="text-xl font-bold">🎓 Learn</h1>
      <Link to="/paper" className="mt-3 block rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 p-4 text-white">
        <span className="text-lg font-bold">📝 Paper trading</span>
        <span className="block text-sm opacity-90">Practise the signals with a virtual $100,000 (USD for US, CAD for Canada). No real money.</span>
      </Link>
      <H2>Short lessons</H2>
      <div className="grid gap-2 sm:grid-cols-2">
        {LESSONS.map((x) => (
          <Link key={x.id} to={`/learn/${x.id}`} className="flex min-h-14 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
            <span className="font-medium">{x.title}</span>
            <span className="text-xs text-slate-500">{x.minutes} min</span>
          </Link>
        ))}
      </div>
      <H2>Glossary</H2>
      <input className={input} placeholder="Search terms (RSI, P/E, 13F…)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search glossary" />
      <Card className="mt-2 p-0">
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {terms.map(([id, t]) => (
            <li key={id} className="px-4 py-2">
              <Term id={id}>{t.title}</Term>
              <p className="text-xs text-slate-500">{t.short}</p>
            </li>
          ))}
        </ul>
      </Card>
      <CountryNotes />
    </div>
  );
}
