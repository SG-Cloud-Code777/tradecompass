import { DataUnavailableError } from '../lib/cache.js';
import { getQuote } from './prices.js';

export type Ccy = 'CAD' | 'USD';

/** CAD↔USD from the CADUSD=X spot quote. Returns how many `to` units one `from` unit buys. */
export async function fxRate(from: Ccy, to: Ccy) {
  if (from === to) return { rate: 1, meta: null as any };
  const qt = await getQuote('CADUSD=X');
  const cadusd = qt.price;
  // CAD/USD has traded between ~0.62 and ~1.10 since 1970; anything outside a wide band is a bad tick.
  if (!(cadusd > 0.5 && cadusd < 1.3)) throw new DataUnavailableError(`Implausible CAD/USD rate ${cadusd} from ${qt.meta.source} — refusing to convert`);
  return { rate: from === 'CAD' ? cadusd : 1 / cadusd, meta: qt.meta, asOf: qt.asOf };
}

export async function converter() {
  const r = await fxRate('CAD', 'USD');
  return { cadToUsd: r.rate, usdToCad: 1 / r.rate, asOf: r.asOf ?? null, meta: r.meta };
}
