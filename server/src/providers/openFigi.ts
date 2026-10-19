import { config } from '../config.js';
import { ProviderError, rateLimiter } from '../lib/http.js';

/** CUSIP -> ticker via OpenFIGI (free; 25 req/min without a key, 10 jobs per request). */
const P = 'openfigi';
const throttle = rateLimiter(config.openFigiKey ? 3 : 0.4);

export async function mapCusips(cusips: string[]): Promise<Map<string, { ticker: string; exchCode: string; name: string }>> {
  const out = new Map<string, { ticker: string; exchCode: string; name: string }>();
  const batch = config.openFigiKey ? 100 : 10;
  for (let i = 0; i < cusips.length; i += batch) {
    const chunk = cusips.slice(i, i + batch);
    await throttle();
    const res = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.openFigiKey ? { 'X-OPENFIGI-APIKEY': config.openFigiKey } : {}) },
      body: JSON.stringify(chunk.map((c) => ({ idType: 'ID_CUSIP', idValue: c }))),
    }).catch((e) => {
      throw new ProviderError(P, e.message);
    });
    if (!res.ok) throw new ProviderError(P, `HTTP ${res.status}`, res.status);
    const json: any[] = await res.json();
    json.forEach((r, k) => {
      const data: any[] = r?.data ?? [];
      // Prefer the US composite listing, then Toronto.
      const pick = data.find((d) => d.exchCode === 'US') ?? data.find((d) => d.exchCode === 'CN') ?? data[0];
      if (pick?.ticker) out.set(chunk[k], { ticker: pick.ticker, exchCode: pick.exchCode, name: pick.name });
    });
  }
  return out;
}
