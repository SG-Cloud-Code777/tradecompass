import type { Market } from '@tradecompass/signals';

export const COUNTRY_NOTES: Record<Market, { title: string; points: string[] }> = {
  CA: {
    title: '🇨🇦 Investing notes for Canada',
    points: [
      'Symbols: .TO = Toronto Stock Exchange, .V = TSX Venture (junior companies; higher risk, often pre-revenue).',
      'Prices are in CAD. Many large Canadian companies are also listed in New York in USD — same company, different currency and liquidity.',
      'CAD-hedged ETFs (e.g. VSP, XSP, ZQQ) remove USD/CAD swings; unhedged ones (e.g. VFV) include them.',
      'TFSA: tax-free growth, ideal for Canadian stocks. RRSP: best home for US dividend payers (treaty exemption from US withholding). FHSA: TFSA-like for first-home savings.',
      'Eligible Canadian dividends get the dividend tax credit in non-registered accounts.',
      'Insider trades are on SEDI (5-day filing deadline); company filings are on SEDAR+.',
    ],
  },
  US: {
    title: '🇺🇸 Investing notes for US markets',
    points: [
      'NYSE and NASDAQ trade 9:30–16:00 ET. Prices are in USD.',
      'Canadians: US dividends have 15% withheld (with a W-8BEN). Recoverable as a foreign tax credit in non-registered accounts, generally exempt in an RRSP, lost in a TFSA/FHSA/RESP.',
      'Converting CAD to USD at a broker can cost 1–2.5% each way; Norbert\'s Gambit or a USD account can reduce that.',
      'US estate tax can apply to Canadians holding large amounts of US-situs assets — Canadian-listed ETFs that hold US stocks avoid this.',
      'Insider trades (Form 4) and institutional holdings (13F) come from SEC EDGAR.',
    ],
  },
};
