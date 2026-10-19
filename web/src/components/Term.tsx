import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { GLOSSARY } from '../content/glossary';

const Ctx = createContext<(id: string) => void>(() => {});

export function GlossaryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const term = open ? GLOSSARY[open] : null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <Ctx.Provider value={setOpen}>
      {children}
      {term && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="term-title"
            className="w-full max-w-lg rounded-t-3xl bg-white p-5 pb-8 shadow-xl dark:bg-slate-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
            <h3 id="term-title" className="text-lg font-semibold">
              {term.title}
            </h3>
            <p className="mt-1 font-medium text-sky-700 dark:text-sky-300">{term.short}</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{term.body}</p>
            <button className="mt-5 min-h-11 w-full rounded-xl bg-slate-200 font-semibold dark:bg-slate-800" onClick={() => setOpen(null)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Wrap any metric label: tapping it opens a plain-English explanation. */
export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const open = useContext(Ctx);
  if (!GLOSSARY[id]) return <>{children}</>;
  return (
    <button type="button" onClick={() => open(id)} className="inline-flex items-center gap-1 text-left underline decoration-dotted underline-offset-4" aria-label={`Explain ${GLOSSARY[id].title}`}>
      {children ?? GLOSSARY[id].title}
      <span className="text-[10px] text-sky-600 no-underline dark:text-sky-400" aria-hidden>
        ⓘ
      </span>
    </button>
  );
}

export const useGlossary = () => useContext(Ctx);
