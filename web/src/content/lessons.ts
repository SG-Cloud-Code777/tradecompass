export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  sections: { h: string; p: string }[];
  terms?: string[];
}

export const LESSONS: Lesson[] = [
  {
    id: 'charts',
    title: 'How to read a price chart',
    minutes: 4,
    terms: ['ma', 'support', 'volume'],
    sections: [
      { h: 'Candles', p: 'Each candle is one day. The body spans open to close: green if it closed higher than it opened, red if lower. The thin wicks show the day\'s high and low.' },
      { h: 'Trend', p: 'Higher highs and higher lows = uptrend. Lower highs and lower lows = downtrend. The 50- and 200-day moving averages make the trend easy to see.' },
      { h: 'Volume', p: 'The bars at the bottom show shares traded. Breakouts on high volume are more trustworthy than those on light volume.' },
      { h: 'Levels', p: 'Prices often pause where they reversed before. Old highs become resistance; old lows become support. Once broken, resistance often turns into support.' },
    ],
  },
  {
    id: 'rsi-macd',
    title: 'RSI & MACD: measuring momentum',
    minutes: 4,
    terms: ['rsi', 'macd'],
    sections: [
      { h: 'RSI', p: 'RSI compares recent up moves to down moves on a 0–100 scale. Under 30 means the stock has fallen hard and fast (oversold); over 70 means it has risen hard and fast (overbought).' },
      { h: 'The catch', p: 'Oversold can get more oversold. In a strong downtrend RSI can sit under 30 for weeks. Use RSI together with the trend, not alone.' },
      { h: 'MACD', p: 'MACD tracks whether the short-term average is pulling away from the long-term one. A crossover above its signal line shows momentum turning up; the histogram shrinking warns momentum is fading.' },
    ],
  },
  {
    id: 'mas',
    title: 'Moving averages & golden crosses',
    minutes: 3,
    terms: ['ma', 'golden_cross'],
    sections: [
      { h: 'Why they matter', p: 'Many institutions use the 200-day MA as a simple trend filter. Being above it means the long-term trend is up.' },
      { h: 'Crosses', p: 'A golden cross (50 above 200) and death cross (50 below 200) are slow, lagging signals. They help avoid big downtrends but whipsaw in sideways markets.' },
    ],
  },
  {
    id: 'pe',
    title: 'P/E and valuation basics',
    minutes: 4,
    terms: ['pe', 'pb', 'eps_growth', 'fcf'],
    sections: [
      { h: 'What P/E means', p: 'A P/E of 20 means you pay $20 for every $1 of yearly profit. Compare P/E within a sector, because different industries grow at different speeds.' },
      { h: 'Growth matters', p: 'A high P/E can be fine if earnings grow quickly. A low P/E can be a trap if earnings are about to fall (common in cyclical stocks like miners at the top of the cycle).' },
      { h: 'Cash is king', p: 'Free cash flow is harder to dress up than earnings. Companies that consistently generate cash can pay dividends, buy back shares and survive downturns.' },
    ],
  },
  {
    id: 'dividends',
    title: 'Dividends without the traps',
    minutes: 4,
    terms: ['yield', 'payout', 'withholding'],
    sections: [
      { h: 'Yield', p: 'Yield = annual dividend ÷ price. When the price falls, the yield rises — a 10% yield is often a sign the market expects a cut.' },
      { h: 'Payout ratio', p: 'Dividends ÷ earnings. Under ~75% leaves room for bad years; over 100% is a red flag.' },
      { h: 'Ex-dividend date', p: 'You must own the stock before the ex-dividend date to receive the next payment. The price usually drops by about the dividend amount on that day — it is not free money.' },
      { h: 'Canada', p: 'Eligible dividends from Canadian companies get the dividend tax credit in non-registered accounts. US dividends have 15% withheld (recoverable in non-registered accounts, generally exempt in RRSPs, lost in TFSAs).' },
    ],
  },
  {
    id: 'reits',
    title: 'REIT basics',
    minutes: 3,
    terms: ['ffo'],
    sections: [
      { h: 'What a REIT is', p: 'A Real Estate Investment Trust owns income properties and pays out most of its cash flow. Canadian REITs trade with "-UN" in the symbol (e.g. REI-UN.TO).' },
      { h: 'Measure with FFO', p: 'Depreciation makes REIT earnings look small. Use FFO/AFFO, occupancy and debt levels instead.' },
      { h: 'Rate sensitivity', p: 'REITs borrow heavily and compete with bonds for income investors, so rising interest rates usually hurt them.' },
    ],
  },
  {
    id: 'etf-vs-stock',
    title: 'ETF vs. individual stock',
    minutes: 3,
    terms: ['hedged'],
    sections: [
      { h: 'ETFs', p: 'One trade buys a basket. Lower single-company risk, low fees (check the MER), and you can\'t underperform the index you own.' },
      { h: 'Stocks', p: 'More upside and more downside. A single company can lose 80% even in a rising market.' },
      { h: 'Watch out', p: 'Leveraged and inverse ETFs (2x, 3x, "Bear") reset daily and lose value over time in choppy markets. They are trading tools, not investments.' },
    ],
  },
  {
    id: 'dca',
    title: 'Dollar-cost averaging',
    minutes: 2,
    sections: [
      { h: 'The idea', p: 'Invest a fixed amount on a schedule (e.g. every payday) regardless of price. You buy more shares when prices are low and fewer when high.' },
      { h: 'Why it helps', p: 'It removes the need to time the market and the temptation to panic. For long-term index investing it is often better than trading signals.' },
    ],
  },
  {
    id: 'stops',
    title: 'Stop-losses and position size',
    minutes: 4,
    terms: ['stop_loss', 'position_size', 'risk_reward', 'atr'],
    sections: [
      { h: 'Decide your exit first', p: 'Before buying, decide the price that proves you wrong. Put the stop outside normal daily noise (more than 1 ATR away) and below support.' },
      { h: 'Size from the stop', p: 'If you\'re willing to lose 1% of a $50,000 portfolio ($500) and the stop is $2 below entry, buy 250 shares. Wider stop = fewer shares.' },
      { h: 'Never average down on a broken setup', p: 'Adding to a losing trade below your stop turns a small, planned loss into a large, unplanned one.' },
    ],
  },
  {
    id: 'accounts',
    title: 'TFSA, RRSP, FHSA vs. US accounts',
    minutes: 5,
    terms: ['withholding'],
    sections: [
      { h: 'TFSA', p: 'Growth and withdrawals are tax-free. Best for Canadian stocks and growth. US dividends lose 15% withholding that can\'t be recovered. Day-trading inside a TFSA can get it taxed as a business.' },
      { h: 'RRSP', p: 'Contributions are deductible, withdrawals are taxed as income. The US–Canada treaty generally exempts US-listed stocks and ETFs from withholding in an RRSP — a good home for US dividend payers.' },
      { h: 'FHSA', p: 'For first-time home buyers: deductible contributions and tax-free withdrawals for a qualifying home. Same US withholding issue as a TFSA.' },
      { h: 'Non-registered', p: 'Capital gains are taxed at your marginal rate on 50% of the gain. Canadian eligible dividends get the dividend tax credit; US withholding can be claimed as a foreign tax credit. Losses can offset gains (watch the superficial-loss rule).' },
      { h: 'US investors', p: 'US accounts (IRA, Roth IRA, 401k, taxable) follow US rules. Canadian stocks pay dividends with 15% Canadian withholding for US residents under the treaty.' },
      { h: 'Disclaimer', p: 'Tax rules change and depend on your situation. This is general information — check CRA/IRS guidance or a tax professional.' },
    ],
  },
];
