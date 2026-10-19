import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.js';
import { getJson, getText, ProviderError, rateLimiter } from '../lib/http.js';

/**
 * SEC EDGAR (free, official). Rules: declare a User-Agent with contact info and stay under 10 requests/second.
 * https://www.sec.gov/os/accessing-edgar-data
 */
const P = 'sec-edgar';
const throttle = rateLimiter(8);
const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

async function secJson<T = any>(url: string): Promise<T> {
  await throttle();
  return getJson<T>(url, { provider: P, headers: { 'User-Agent': config.secUserAgent, Accept: 'application/json' } });
}
async function secText(url: string): Promise<string> {
  await throttle();
  return getText(url, { provider: P, headers: { 'User-Agent': config.secUserAgent } });
}

export const padCik = (cik: string | number) => String(cik).replace(/\D/g, '').padStart(10, '0');
const arr = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const val = (x: any): string | undefined => (x && typeof x === 'object' && 'value' in x ? x.value : x ?? undefined);
const n = (x: any) => {
  const v = val(x);
  return v == null || v === '' ? null : Number(String(v).replace(/,/g, ''));
};

export interface FilingRef {
  accession: string;
  form: string;
  filed: string;
  reportDate: string | null;
  primaryDocument: string;
  url: string;
}

export async function tickerToCik(): Promise<Map<string, { cik: string; title: string }>> {
  const json = await secJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
    'https://www.sec.gov/files/company_tickers.json',
  );
  const map = new Map<string, { cik: string; title: string }>();
  for (const r of Object.values(json)) map.set(r.ticker.toUpperCase(), { cik: padCik(r.cik_str), title: r.title });
  return map;
}

export function parseSubmissions(json: any, cik: string): { name: string; filings: FilingRef[] } {
  const r = json?.filings?.recent;
  if (!r) throw new ProviderError(P, 'no recent filings');
  const filings: FilingRef[] = r.accessionNumber.map((acc: string, i: number) => {
    const folder = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}`;
    return {
      accession: acc,
      form: r.form[i],
      filed: r.filingDate[i],
      reportDate: r.reportDate?.[i] || null,
      primaryDocument: r.primaryDocument[i],
      url: `${folder}/${acc}-index.htm`,
    };
  });
  return { name: json.name, filings };
}

export async function submissions(cik: string) {
  return parseSubmissions(await secJson(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`), padCik(cik));
}

// ------------------------------------------------------------- Form 4 (insiders)

export interface InsiderTxn {
  insider: string;
  role: string;
  code: string; // P purchase, S sale, A award, M option exercise, F tax withholding, G gift ...
  acquired: boolean;
  shares: number;
  price: number | null;
  date: string;
}

export function parseForm4(text: string): InsiderTxn[] {
  const doc = xml.parse(text)?.ownershipDocument;
  if (!doc) throw new ProviderError(P, 'not a Form 4 ownershipDocument');
  const owners = arr(doc.reportingOwner);
  const name = owners.map((o: any) => o.reportingOwnerId?.rptOwnerName).filter(Boolean).join(' & ') || 'Unknown';
  const rel = owners[0]?.reportingOwnerRelationship ?? {};
  const truthy = (v: any) => v === '1' || v === 'true' || v === 1 || v === true;
  const role =
    [truthy(rel.isDirector) && 'Director', truthy(rel.isOfficer) && (rel.officerTitle || 'Officer'), truthy(rel.isTenPercentOwner) && '10% owner']
      .filter(Boolean)
      .join(', ') || 'Other';
  return arr(doc.nonDerivativeTable?.nonDerivativeTransaction).map((t: any) => ({
    insider: name,
    role,
    code: t.transactionCoding?.transactionCode ?? '?',
    acquired: val(t.transactionAmounts?.transactionAcquiredDisposedCode) === 'A',
    shares: n(t.transactionAmounts?.transactionShares) ?? 0,
    price: n(t.transactionAmounts?.transactionPricePerShare),
    date: String(val(t.transactionDate)).slice(0, 10),
  }));
}

/** Raw XML path: primaryDocument is often the XSL-rendered "xslF345X05/doc.xml" — strip the stylesheet folder. */
export function form4XmlUrl(cik: string, f: FilingRef) {
  const doc = f.primaryDocument.replace(/^xsl[^/]+\//, '');
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession.replace(/-/g, '')}/${doc}`;
}

export async function recentInsiderTrades(cik: string, sinceDays = 120, maxFilings = 40) {
  const { filings } = await submissions(cik);
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
  const f4 = filings.filter((f) => (f.form === '4' || f.form === '4/A') && f.filed >= since).slice(0, maxFilings);
  const out: (InsiderTxn & { accession: string; filed: string; url: string })[] = [];
  for (const f of f4) {
    try {
      const txns = parseForm4(await secText(form4XmlUrl(cik, f)));
      for (const t of txns) out.push({ ...t, accession: f.accession, filed: f.filed, url: f.url });
    } catch {
      // one malformed filing should not hide the rest
    }
  }
  return out;
}

/** 13D/13G beneficial-ownership filings (>5% stakes). Forms were renamed SCHEDULE 13D/G in Dec 2024. */
export function ownershipFilings(filings: FilingRef[]) {
  return filings.filter((f) => /^(SC|SCHEDULE) 13[DG]/.test(f.form)).slice(0, 20);
}

// ------------------------------------------------------------- 13F (institutional holdings)

export interface InfoTableRow {
  issuer: string;
  titleClass: string;
  cusip: string;
  valueUsd: number;
  shares: number;
  putCall: string | null;
}

/** Since 2023-01-03 the 13F <value> is in dollars; before that it was in thousands. */
export function parseInfoTable(text: string, filed: string): InfoTableRow[] {
  const doc = xml.parse(text)?.informationTable;
  if (!doc) throw new ProviderError(P, 'not a 13F information table');
  const mult = filed < '2023-01-03' ? 1000 : 1;
  return arr(doc.infoTable).map((r: any) => ({
    issuer: String(r.nameOfIssuer ?? ''),
    titleClass: String(r.titleOfClass ?? ''),
    cusip: String(r.cusip ?? '').toUpperCase(),
    valueUsd: (n(r.value) ?? 0) * mult,
    shares: n(r.shrsOrPrnAmt?.sshPrnamt) ?? 0,
    putCall: r.putCall ? String(r.putCall) : null,
  }));
}

export async function fetch13F(cik: string, f: FilingRef): Promise<InfoTableRow[]> {
  const folder = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accession.replace(/-/g, '')}`;
  const idx = await secJson(`${folder}/index.json`);
  const items: { name: string }[] = idx?.directory?.item ?? [];
  const xmls = items.map((i) => i.name).filter((nme) => /\.xml$/i.test(nme) && !/primary_doc/i.test(nme));
  if (!xmls.length) throw new ProviderError(P, `no information table in ${f.accession}`);
  // Merge all info tables (a few filers split them).
  const rows: InfoTableRow[] = [];
  for (const file of xmls) {
    try {
      rows.push(...parseInfoTable(await secText(`${folder}/${file}`), f.filed));
    } catch {
      // not an info table (e.g. other XML exhibits)
    }
  }
  if (!rows.length) throw new ProviderError(P, `could not parse information table in ${f.accession}`);
  return rows;
}

export const thirteenFFilings = (filings: FilingRef[]) => filings.filter((f) => f.form === '13F-HR');

export const SEC_LINKS = {
  edgarCompany: (cik: string) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${padCik(cik)}`,
  fullTextSearch: (q: string) => `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(q)}`,
};
