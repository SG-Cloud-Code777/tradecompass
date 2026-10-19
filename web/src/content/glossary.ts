export interface Term {
  title: string;
  short: string;
  body: string;
}

/** Tap-to-explain definitions used by <Term id="..."> across the app. */
export const GLOSSARY: Record<string, Term> = {
  score: {
    title: 'Signal score (−100 to +100)',
    short: 'Weighted sum of seven rule-based factors.',
    body: 'Trend 25, Momentum 20, Fundamentals 20, Volume 10, Levels 10, Macro 10, Smart money 5. Factors without data drop out and the rest are re-weighted, which lowers confidence. ≥60 Strong Buy · ≥20 Buy · between −20 and 20 Hold · ≤−20 Sell · ≤−60 Strong Sell. Each reason shows how many points it contributed.',
  },
  confidence: {
    title: 'Confidence',
    short: 'How much data we had and how much the factors agree.',
    body: 'Agreement (share of factor weight pointing the same way as the final score) × √coverage (share of factor weight that had data). High ≥ 70, Medium ≥ 45. Low confidence means the factors disagree or data is missing — treat the signal with extra caution.',
  },
  ma: {
    title: 'Moving average (50-day / 200-day)',
    short: 'Average closing price over the last N trading days.',
    body: 'Smooths out daily noise. Price above the 200-day MA is the classic definition of a long-term uptrend. The 50-day tracks the medium-term trend.',
  },
  golden_cross: {
    title: 'Golden cross / death cross',
    short: '50-day MA crossing above (golden) or below (death) the 200-day MA.',
    body: 'A golden cross suggests a new uptrend; a death cross a new downtrend. They lag — by the time they happen, much of the move may already be done — and they produce false signals in sideways markets.',
  },
  rsi: {
    title: 'RSI (Relative Strength Index, 14)',
    short: 'Momentum oscillator from 0 to 100.',
    body: 'Compares the size of recent gains to recent losses. Below 30 = oversold (selling may be overdone), above 70 = overbought (buying may be stretched). In strong trends RSI can stay overbought or oversold for a long time.',
  },
  macd: {
    title: 'MACD',
    short: 'Difference between the 12- and 26-day EMAs, vs. its 9-day signal line.',
    body: 'When MACD crosses above its signal line, momentum is turning up (bullish crossover); crossing below is bearish. The histogram shows the gap between the two — shrinking bars mean momentum is fading.',
  },
  bollinger: {
    title: 'Bollinger Bands',
    short: '20-day average ± 2 standard deviations.',
    body: 'About 95% of closes fall inside the bands in normal conditions. A close outside a band means price is stretched; bands that squeeze together often come before a big move.',
  },
  atr: {
    title: 'ATR (Average True Range)',
    short: 'How much the price typically moves in a day.',
    body: 'Used to set stops that are outside normal daily noise. A stop closer than 1 ATR is likely to be hit by random movement.',
  },
  volume: {
    title: 'Volume & accumulation/distribution',
    short: 'How many shares traded, and whether they closed near the high or low.',
    body: 'A price move on heavy volume is more meaningful than one on light volume. The A/D line rises when the stock keeps closing near its daily high on volume (buyers in control).',
  },
  support: {
    title: 'Support & resistance',
    short: 'Price levels where buying (support) or selling (resistance) showed up before.',
    body: 'We use recent swing lows as support and swing highs as resistance. Buying near support lets you set a tight stop; buying just below resistance risks the stock stalling.',
  },
  week52: {
    title: '52-week high / low',
    short: 'Highest and lowest price in the past year.',
    body: 'Stocks making new highs tend to keep outperforming (momentum); stocks near their lows are often weak for a reason.',
  },
  pe: {
    title: 'P/E ratio',
    short: 'Price ÷ earnings per share.',
    body: 'How many dollars you pay for $1 of annual profit. Compare with the sector median, not across sectors — software always looks pricier than banks. Negative P/E means the company lost money.',
  },
  eps_growth: { title: 'EPS growth', short: 'Change in earnings per share vs. a year ago.', body: 'Rising earnings are what ultimately drive stock prices over the long run.' },
  revenue_growth: { title: 'Revenue growth', short: 'Change in sales vs. a year ago.', body: 'Harder to manipulate than earnings. Shrinking revenue is a warning sign even if earnings look fine.' },
  de: {
    title: 'Debt-to-equity',
    short: 'Total debt ÷ shareholders\' equity.',
    body: 'Above ~2 means the company relies heavily on borrowing, which hurts when rates rise or business slows. Banks, utilities and REITs normally carry more debt.',
  },
  fcf: { title: 'Free cash flow', short: 'Cash from operations minus capital spending.', body: 'The cash a company actually has left to pay dividends, buy back shares or pay down debt. Negative FCF means it is burning cash.' },
  yield: { title: 'Dividend yield', short: 'Annual dividend ÷ share price.', body: 'A very high yield (e.g. above 8%) often means the market expects a cut. Check the payout ratio.' },
  payout: {
    title: 'Payout ratio',
    short: 'Dividends ÷ earnings.',
    body: 'Below ~75% is usually sustainable for regular companies. Above 100% means the dividend is larger than profits — it is being paid from debt or savings. REITs are judged on AFFO payout instead.',
  },
  pb: { title: 'Price-to-book (P/B)', short: 'Price ÷ book value (assets minus liabilities) per share.', body: 'Useful for banks, insurers and asset-heavy businesses. Below 1 can mean value — or trouble.' },
  ffo: {
    title: 'FFO & P/FFO (REITs)',
    short: 'Funds From Operations — the REIT version of earnings.',
    body: 'FFO adds back property depreciation, which is a large non-cash expense that makes REIT EPS misleading. P/FFO is the REIT equivalent of P/E: below ~12 is cheap, above ~20 is rich. Occupancy shows how full the buildings are.',
  },
  risk_reward: {
    title: 'Risk/reward ratio',
    short: 'Potential gain to target 1 ÷ potential loss to the stop.',
    body: 'At 2:1 you can be wrong more than half the time and still come out ahead. Below 1.5:1 the trade usually isn\'t worth it.',
  },
  position_size: {
    title: 'Position sizing',
    short: 'How many shares to buy so that hitting your stop costs a fixed % of your portfolio.',
    body: 'Shares = (portfolio × risk %) ÷ (entry − stop). Risking 1–2% per trade means a run of 10 losses costs 10–20%, not your whole account. We also cap a single position at 25% of the portfolio.',
  },
  stop_loss: {
    title: 'Stop-loss',
    short: 'A pre-set price where you exit to cap the loss.',
    body: 'Decide it before you buy. Stops can "gap": if a stock opens far below your stop (e.g. after earnings), you sell at the open, not at your stop price.',
  },
  backtest: {
    title: 'Backtest',
    short: 'Replaying the rules over past prices.',
    body: 'We replay only the technical rules (fundamentals and fund holdings are not available point-in-time), long-only, with 0.1% cost per side. Backtests flatter strategies — real results are usually worse. Look at the max drawdown and losing years, not just the total return.',
  },
  drawdown: { title: 'Max drawdown', short: 'Largest peak-to-trough fall.', body: 'Tells you how painful the worst stretch was. Ask yourself whether you could have held through it.' },
  win_rate: { title: 'Win rate', short: 'Share of closed trades that made money.', body: 'Meaningless on its own: a 30% win rate can be profitable if winners are much larger than losers, and a 70% win rate can lose money.' },
  thirteen_f: {
    title: '13F filing',
    short: 'Quarterly list of US-listed stocks held by managers with $100M+.',
    body: 'Filed up to 45 days after quarter end, so it can be 4–5 months old by the time you read it. It shows long positions only — not shorts, hedges, cash or most non-US holdings. Funds may have already sold.',
  },
  form4: {
    title: 'Form 4 (insider trades)',
    short: 'US insiders must report trades within 2 business days.',
    body: 'Code P = open-market purchase (the informative one), S = sale. Insiders sell for many reasons (taxes, diversification) but usually buy for one: they expect the price to rise. Several insiders buying = "cluster buying".',
  },
  sedi: { title: 'SEDI', short: 'Canada\'s insider-reporting system.', body: 'Canadian insiders must file within 5 calendar days of a trade. Search by issuer at sedi.ca.' },
  thirteen_dg: { title: '13D / 13G', short: 'Filed when an investor passes 5% ownership.', body: '13D = may seek to influence the company (activist). 13G = passive investor.' },
  macro: {
    title: 'Macro factor',
    short: 'How rates, the US dollar, inflation and the sector\'s commodity are trending.',
    body: 'Each sector has a sensitivity: e.g. gold miners like falling rates and a falling dollar; REITs dislike rising rates; oil producers follow crude. We use 20-day changes of the US 10-year yield (^TNX), the dollar index (DXY), TIP÷IEF as an inflation-expectations proxy, and the sector commodity.',
  },
  hedged: {
    title: 'CAD-hedged ETF',
    short: 'Removes the effect of USD/CAD moves on a US-asset ETF.',
    body: 'If the Canadian dollar rises, an unhedged US ETF loses value in CAD terms; a hedged one does not (and vice-versa). Hedging has a small cost.',
  },
  withholding: {
    title: 'US withholding tax',
    short: '15% of US dividends withheld for Canadians (with a W-8BEN).',
    body: 'Recoverable as a foreign tax credit in a non-registered account; generally exempt in an RRSP for US-listed securities; lost in a TFSA, FHSA or RESP.',
  },
};
