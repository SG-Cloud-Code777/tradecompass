import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lastCompletedSession, marketOf, marketStatus } from '../src/lib/marketHours.js';
import { avSymbol, parseDaily, parseNews, parseOverview } from '../src/providers/alphaVantage.js';
import { parseFmpTrades } from '../src/providers/congress.js';
import { form4XmlUrl, parseForm4, parseInfoTable, parseSubmissions } from '../src/providers/secEdgar.js';
import { parseTimeSeries, tdSymbol } from '../src/providers/twelveData.js';
import { parseChart, parseQuoteFromChart, parseQuoteSummary, parseSearch } from '../src/providers/yahoo.js';
import { baseTicker, diffPositions, normName } from '../src/services/smartMoney.js';
import { sectorTrend } from '../src/services/sectors.js';
import { yahooChart } from './helpers.js';

const fx = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

describe('yahoo parsers', () => {
  it('parses chart bars, skips null rows and normalises to session dates', () => {
    const json = yahooChart('AAPL', [100, 101, 102], '2026-10-14');
    json.chart.result[0].indicators.quote[0].close[1] = null;
    const { bars } = parseChart(json);
    expect(bars.map((b) => new Date(b.t * 1000).toISOString().slice(0, 10))).toEqual(['2026-10-12', '2026-10-14']);
  });

  it('builds a quote from chart meta', () => {
    const q = parseQuoteFromChart('AAPL', yahooChart('AAPL', [100, 110], '2026-10-15', { prevClose: 100 }));
    expect(q.price).toBe(110);
    expect(q.changePct).toBeCloseTo(0.1);
    expect(q.currency).toBe('USD');
  });

  it('maps quoteSummary fundamentals (D/E percent -> ratio)', () => {
    const f = parseQuoteSummary(JSON.parse(fx('quoteSummary.json')));
    expect(f.pe).toBe(28.4);
    expect(f.debtToEquity).toBeCloseTo(1.5449);
    expect(f.epsGrowth).toBe(0.12);
    expect(f.earningsDate).toBe('2026-10-30');
    expect(f.isEtf).toBe(false);
  });

  it('filters search results to equities/ETFs', () => {
    const r = parseSearch({
      quotes: [
        { symbol: 'RY.TO', shortname: 'ROYAL BANK', quoteType: 'EQUITY', exchDisp: 'Toronto' },
        { symbol: 'RY=F', quoteType: 'FUTURE' },
      ],
      news: [{ title: 'x', link: 'https://x', publisher: 'P', providerPublishTime: 1760000000 }],
    });
    expect(r.hits).toHaveLength(1);
    expect(r.news[0].sentiment).toBeNull();
  });

  it('surfaces chart API errors', () => {
    expect(() => parseChart({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } })).toThrow(/delisted/);
  });
});

describe('alpha vantage / twelve data parsers', () => {
  it('maps TSX symbols', () => {
    expect(avSymbol('RY.TO')).toBe('RY.TRT');
    expect(avSymbol('SGD.V')).toBe('SGD.TRV');
    expect(tdSymbol('REI-UN.TO')).toEqual({ symbol: 'REI.UN', exchange: 'TSX' });
    expect(tdSymbol('TECK-B.TO')).toEqual({ symbol: 'TECK.B', exchange: 'TSX' });
    expect(tdSymbol('AAPL')).toEqual({ symbol: 'AAPL' });
  });

  it('parses daily series oldest-first', () => {
    const bars = parseDaily({
      'Time Series (Daily)': {
        '2026-10-16': { '1. open': '2', '2. high': '3', '3. low': '1', '4. close': '2.5', '5. volume': '10' },
        '2026-10-15': { '1. open': '1', '2. high': '2', '3. low': '1', '4. close': '1.5', '5. volume': '5' },
      },
    });
    expect(bars[0].c).toBe(1.5);
    expect(bars[1].v).toBe(10);
    const td = parseTimeSeries({ values: [{ datetime: '2026-10-16', open: '1', high: '1', low: '1', close: '1', volume: '1' }, { datetime: '2026-10-15', open: '2', high: '2', low: '2', close: '2', volume: '2' }] });
    expect(td[0].c).toBe(2);
  });

  it('extracts ticker-level news sentiment', () => {
    const items = parseNews(JSON.parse(fx('avNews.json')), 'EXMP');
    expect(items[0].sentiment).toBe(0.41);
    expect(items[0].publishedAt).toBe('2026-10-16T14:30:00Z');
    expect(items[1].sentiment).toBe(-0.05);
  });

  it('derives payout ratio from overview', () => {
    const f = parseOverview({ Symbol: 'X', PERatio: '20', EPS: '4', DividendPerShare: '2', QuarterlyRevenueGrowthYOY: '0.1', AssetType: 'Common Stock' });
    expect(f.payoutRatio).toBe(0.5);
    expect(f.pe).toBe(20);
  });
});

describe('SEC EDGAR parsers', () => {
  it('parses Form 4 transactions with roles, codes and comma numbers', () => {
    const t = parseForm4(fx('form4.xml'));
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ insider: 'DOE JANE', role: 'Chief Financial Officer', code: 'P', shares: 2500, price: 41.37, date: '2026-08-12', acquired: true });
    expect(t[1]).toMatchObject({ code: 'F', date: '2026-08-13', acquired: false });
  });

  it('parses namespaced 13F information tables and scales pre-2023 values', () => {
    const rows = parseInfoTable(fx('infotable.xml'), '2026-08-14');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ issuer: 'APPLE INC', cusip: '037833100', valueUsd: 69_900_000_000, shares: 300_000_000, putCall: null });
    expect(rows[2].putCall).toBe('Put');
    expect(rows[2].cusip).toBe('78462F103');
    expect(parseInfoTable(fx('infotable.xml'), '2022-11-14')[2].valueUsd).toBe(1_000_000_000);
  });

  it('parses submissions and builds raw Form 4 XML URLs', () => {
    const { filings } = parseSubmissions(
      { name: 'X', filings: { recent: { accessionNumber: ['0001-26-000001'], form: ['4'], filingDate: ['2026-08-14'], reportDate: [''], primaryDocument: ['xslF345X05/wk-form4.xml'] } } },
      '0000012345',
    );
    expect(filings[0].reportDate).toBeNull();
    expect(form4XmlUrl('0000012345', filings[0])).toBe('https://www.sec.gov/Archives/edgar/data/12345/000126000001/wk-form4.xml');
  });

  it('normalises issuer names and tickers for matching', () => {
    expect(normName('BARRICK MINING CORP')).toBe('BARRICK MINING');
    expect(normName('Barrick Mining Corp')).toBe(normName('BARRICK MINING CORPORATION'));
    expect(baseTicker('TECK-B.TO')).toBe('TECK');
    expect(baseTicker('REI-UN.TO')).toBe('REI');
  });

  it('diffs two 13F quarters into new / added / trimmed / exited', () => {
    const p = (cusip: string, shares: number) => [cusip, { cusip, issuer: cusip, ticker: null, value: shares * 10, shares }] as const;
    const prev = new Map([p('A', 100), p('B', 100), p('C', 100)]);
    const cur = new Map([p('A', 150), p('B', 100), p('D', 50)]);
    const d = Object.fromEntries(diffPositions(cur as any, prev as any).map((x) => [x.cusip, x.status]));
    expect(d).toEqual({ A: 'added', B: 'held', D: 'new', C: 'exited' });
  });

  it('maps congressional trades', () => {
    const t = parseFmpTrades([{ firstName: 'A', lastName: 'B', type: 'Purchase', amount: '$1,001 - $15,000', transactionDate: '2026-09-01', disclosureDate: '2026-09-20', link: 'x' }], 'Senate');
    expect(t[0]).toMatchObject({ member: 'A B', chamber: 'Senate', type: 'Purchase' });
  });
});

describe('market hours', () => {
  const at = (iso: string) => new Date(iso);
  it('knows sessions, weekends and holidays per exchange', () => {
    expect(marketStatus('US', at('2026-10-16T14:00:00Z')).open).toBe(true); // Fri 10:00 ET
    expect(marketStatus('US', at('2026-10-17T15:00:00Z')).reason).toBe('Weekend');
    // Canadian Thanksgiving: TSX closed, NYSE open
    expect(marketStatus('CA', at('2026-10-12T15:00:00Z')).open).toBe(false);
    expect(marketStatus('US', at('2026-10-12T15:00:00Z')).open).toBe(true);
    // US Thanksgiving: NYSE closed, TSX open
    expect(marketStatus('US', at('2026-11-26T15:00:00Z')).open).toBe(false);
    expect(marketStatus('CA', at('2026-11-26T15:00:00Z')).open).toBe(true);
    expect(marketStatus('US', at('2026-11-27T19:00:00Z')).open).toBe(false); // early close 13:00 ET
    expect(marketStatus('US', at('2026-10-16T13:00:00Z')).session).toBe('pre');
  });

  it('finds the last completed session', () => {
    expect(lastCompletedSession('US', at('2026-10-18T15:00:00Z'))).toBe('2026-10-16'); // Sunday -> Friday
    expect(lastCompletedSession('CA', at('2026-10-13T12:00:00Z'))).toBe('2026-10-09'); // Tue morning after Thanksgiving Monday
    expect(lastCompletedSession('US', at('2026-10-16T21:00:00Z'))).toBe('2026-10-16');
  });

  it('routes symbols to markets', () => {
    expect(marketOf('RY.TO')).toBe('CA');
    expect(marketOf('SGD.V')).toBe('CA');
    expect(marketOf('BRK-B')).toBe('US');
  });
});

describe('sector trend', () => {
  it('needs breadth to confirm the average', () => {
    expect(sectorTrend([{ ret20: 0.05, above50: true }, { ret20: 0.03, above50: true }]).trend).toBe('up');
    expect(sectorTrend([{ ret20: -0.05, above50: false }, { ret20: -0.01, above50: false }]).trend).toBe('down');
    expect(sectorTrend([{ ret20: 0.2, above50: false }, { ret20: 0.0, above50: false }, { ret20: 0, above50: true }]).trend).toBe('flat');
    expect(sectorTrend([]).trend).toBeNull();
  });
});
