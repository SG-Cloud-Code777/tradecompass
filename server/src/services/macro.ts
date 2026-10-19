import { SECTORS, type Direction, type Macro, type SectorId } from '@tradecompass/signals';
import { getBars } from './prices.js';

export interface MacroSeries {
  key: 'rates' | 'usd' | 'inflation' | 'commodity';
  name: string;
  symbol: string;
  last: number | null;
  change20: number | null;
  direction: Direction | null;
  /** How `change20` is measured: absolute points (yields) or a percentage. */
  unit: 'pts' | 'pct';
  error?: string;
  asOf?: string | null;
}

/** 20-session change and the threshold that counts as a move (below it = flat). */
async function series(key: MacroSeries['key'], name: string, symbol: string, unit: 'pts' | 'pct', threshold: number): Promise<MacroSeries> {
  try {
    const { bars, meta } = await getBars(symbol);
    if (bars.length < 21) throw new Error('not enough history');
    const last = bars[bars.length - 1].c;
    const prev = bars[bars.length - 21].c;
    const change20 = unit === 'pts' ? last - prev : last / prev - 1;
    const direction: Direction = change20 > threshold ? 'up' : change20 < -threshold ? 'down' : 'flat';
    return { key, name, symbol, last, change20, direction, unit, asOf: meta.lastBar, ...(meta.stale ? { error: meta.error } : {}) };
  } catch (e) {
    return { key, name, symbol, last: null, change20: null, direction: null, unit, error: (e as Error).message };
  }
}

/** Inflation-expectations proxy: TIP (inflation-protected) ÷ IEF (nominal) Treasuries, both 7–10y-ish duration. */
async function inflationProxy(): Promise<MacroSeries> {
  const base: MacroSeries = { key: 'inflation', name: 'Inflation expectations (TIP÷IEF)', symbol: 'TIP/IEF', last: null, change20: null, direction: null, unit: 'pct' };
  try {
    const [tip, ief] = await Promise.all([getBars('TIP'), getBars('IEF')]);
    const iefByT = new Map(ief.bars.map((b) => [b.t, b.c]));
    const ratio = tip.bars.filter((b) => iefByT.has(b.t)).map((b) => b.c / iefByT.get(b.t)!);
    if (ratio.length < 21) throw new Error('not enough history');
    const change20 = ratio[ratio.length - 1] / ratio[ratio.length - 21] - 1;
    return { ...base, last: ratio[ratio.length - 1], change20, direction: change20 > 0.005 ? 'up' : change20 < -0.005 ? 'down' : 'flat', asOf: tip.meta.lastBar };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

export async function macroSeries(sector?: SectorId | 'other'): Promise<MacroSeries[]> {
  const profile = sector && sector !== 'other' ? SECTORS[sector] : undefined;
  const list = await Promise.all([
    series('rates', 'US 10-year Treasury yield', '^TNX', 'pts', 0.1),
    series('usd', 'US Dollar Index', 'DX-Y.NYB', 'pct', 0.01),
    inflationProxy(),
    ...(profile?.commoditySymbol ? [series('commodity', profile.commodityName ?? 'Commodity', profile.commoditySymbol, 'pct', 0.02)] : []),
  ]);
  return list;
}

export function toMacro(list: MacroSeries[]): Macro {
  const m: Macro = {};
  for (const s of list) m[s.key] = s.direction;
  return m;
}

/** Commodities strip for the home screen. */
export const COMMODITIES = [
  { symbol: 'GC=F', name: 'Gold' },
  { symbol: 'SI=F', name: 'Silver' },
  { symbol: 'HG=F', name: 'Copper' },
  { symbol: 'CL=F', name: 'WTI Oil' },
  { symbol: 'NG=F', name: 'Nat Gas' },
  { symbol: '^TNX', name: 'US 10Y' },
  { symbol: 'CADUSD=X', name: 'CAD/USD' },
];
