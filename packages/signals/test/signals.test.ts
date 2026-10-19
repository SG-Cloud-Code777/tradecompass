import { describe, expect, it } from 'vitest';
import {
  atr,
  backtest,
  bollinger,
  buildPlan,
  ema,
  labelFor,
  positionSize,
  rsi,
  scoreBars,
  sma,
  supportResistance,
  type Bar,
} from '../src/index.js';

/** Deterministic synthetic series (test fixtures only — the app never shows synthetic prices). */
function series(closes: number[], vol = 1_000_000): Bar[] {
  return closes.map((c, i) => ({
    t: 1_700_000_000 + i * 86_400,
    o: i ? closes[i - 1] : c,
    h: Math.max(c, i ? closes[i - 1] : c) * 1.005,
    l: Math.min(c, i ? closes[i - 1] : c) * 0.995,
    c,
    v: vol,
  }));
}
const wave = (n: number, start: number, drift: number, amp = 0.02) =>
  Array.from({ length: n }, (_, i) => start * (1 + drift) ** i * (1 + amp * Math.sin(i / 3)));

describe('indicators', () => {
  it('sma', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('ema is seeded with the sma and converges on a constant', () => {
    const e = ema([2, 4, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6], 3);
    expect(e[2]).toBe(4);
    expect(e[14]).toBeCloseTo(6, 3);
  });

  it('rsi is 100 for a strictly rising series and 0 for a falling one', () => {
    const up = Array.from({ length: 30 }, (_, i) => 10 + i);
    expect(rsi(up)[29]).toBe(100);
    expect(rsi(up.slice().reverse())[29]).toBe(0);
  });

  it('rsi matches a hand-computed Wilder value', () => {
    // 15 closes: gains 1,1,1,1,1,1,1 and losses 1,1,1,1,1,1,1 -> avg gain == avg loss -> 50
    const c = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10];
    expect(rsi(c)[14]).toBeCloseTo(50, 6);
  });

  it('bollinger bands collapse on a constant series', () => {
    const b = bollinger(Array(25).fill(7));
    expect(b.upper[24]).toBe(7);
    expect(b.lower[24]).toBe(7);
  });

  it('atr equals the constant range when bars have no gaps', () => {
    const bars: Bar[] = Array.from({ length: 20 }, (_, i) => ({ t: i, o: 10, h: 11, l: 9, c: 10, v: 1 }));
    expect(atr(bars)[19]).toBeCloseTo(2, 6);
  });

  it('finds the nearest swing support below and resistance above', () => {
    const closes = [10, 9, 8, 7, 8, 9, 10, 11, 12, 13, 12, 11, 10, 11, 10.5, 10.8, 10.6, 10.7];
    const bars = series(closes);
    const { support, resistance } = supportResistance(bars, bars.length - 1, 50, 2);
    expect(support).not.toBeNull();
    expect(support!).toBeLessThan(bars[bars.length - 1].c);
    expect(resistance!).toBeGreaterThan(bars[bars.length - 1].c);
  });
});

describe('labels', () => {
  it('maps scores to labels at the documented thresholds', () => {
    expect(labelFor(100)).toBe('STRONG BUY');
    expect(labelFor(60)).toBe('STRONG BUY');
    expect(labelFor(59)).toBe('BUY');
    expect(labelFor(20)).toBe('BUY');
    expect(labelFor(19)).toBe('HOLD');
    expect(labelFor(-19)).toBe('HOLD');
    expect(labelFor(-20)).toBe('SELL');
    expect(labelFor(-60)).toBe('STRONG SELL');
  });
});

describe('scoring', () => {
  const uptrend = series(wave(300, 50, 0.003));
  const downtrend = series(wave(300, 100, -0.003));

  it('rates a steady uptrend bullish and a downtrend bearish', () => {
    const up = scoreBars(uptrend);
    const down = scoreBars(downtrend);
    expect(up.score).toBeGreaterThan(20);
    expect(down.score).toBeLessThan(-20);
    expect(up.factors.find((f) => f.factor === 'trend')!.value).toBeCloseTo(1, 6);
    expect(down.factors.find((f) => f.factor === 'trend')!.value).toBeCloseTo(-1, 6);
  });

  it('is fully explainable: reason points sum to the score', () => {
    const r = scoreBars(uptrend, {
      sector: 'gold',
      fundamentals: { pe: 12, sectorPe: 18, epsGrowth: 0.2, revenueGrowth: 0.05, freeCashFlow: 1e9, debtToEquity: 0.3 },
      macro: { rates: 'down', usd: 'down', inflation: 'flat', commodity: 'up' },
      smartMoney: { insiderBuyers90d: 3, insiderSellers90d: 0, fundsAdding: 2, fundsTrimming: 1 },
    });
    const total = r.factors.flatMap((f) => f.reasons).reduce((a, x) => a + x.points, 0);
    expect(Math.round(total)).toBe(r.score);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.topReasons.length).toBe(3);
    expect(r.topReasons.every((x) => x.points > 0)).toBe(true);
    expect(r.confidence.coverage).toBe(1);
  });

  it('does not report High confidence when factors disagree', () => {
    const r = scoreBars(uptrend, { sector: 'gold', macro: { rates: 'up', usd: 'up', commodity: 'down' }, fundamentals: { pe: -3, revenueGrowth: -0.2, freeCashFlow: -1 } });
    expect(r.confidence.agreement).toBeLessThan(0.7);
    expect(r.confidence.level).not.toBe('High');
  });

  it('drops unavailable factors and lowers confidence coverage', () => {
    const r = scoreBars(uptrend);
    expect(r.factors.find((f) => f.factor === 'fundamentals')!.available).toBe(false);
    expect(r.confidence.coverage).toBeCloseTo(0.65, 6);
  });

  it('macro headwinds pull a gold signal down', () => {
    const tail = scoreBars(uptrend, { sector: 'gold', macro: { rates: 'down', usd: 'down', commodity: 'up' } });
    const head = scoreBars(uptrend, { sector: 'gold', macro: { rates: 'up', usd: 'up', commodity: 'down' } });
    expect(tail.score).toBeGreaterThan(head.score);
  });

  it('flags unprofitable companies and dividend payouts above 100%', () => {
    const r = scoreBars(uptrend, { fundamentals: { pe: -5, dividendYield: 0.09, payoutRatio: 1.4 } });
    const texts = r.factors.find((f) => f.factor === 'fundamentals')!.reasons.map((x) => x.text).join(' ');
    expect(texts).toMatch(/not profitable/);
    expect(texts).toMatch(/dividend at risk/);
  });

  it('refuses to score too little history', () => {
    expect(() => scoreBars(series([1, 2, 3]))).toThrow(/at least 30/);
  });
});

describe('trade plan', () => {
  it('orders the levels sensibly and states risks', () => {
    const sig = scoreBars(series(wave(300, 50, 0.003)));
    const p = buildPlan(sig, { market: 'US', sector: 'semis' });
    expect(p.stop).toBeLessThan(p.entryLow);
    expect(p.entryLow).toBeLessThanOrEqual(p.entryHigh);
    expect(p.target1).toBeGreaterThan(p.entryHigh);
    expect(p.target2).toBeGreaterThan(p.target1);
    expect(p.riskReward).toBeGreaterThanOrEqual(1.5);
    expect(p.risks.at(-1)).toMatch(/past results do not guarantee/);
    expect(p.sellIf[0]).toMatch(/Stop-loss/);
  });

  it('warns about penny stocks, venture listings and illiquidity', () => {
    const sig = scoreBars(series(wave(300, 0.4, 0.001), 50_000));
    const p = buildPlan(sig, { market: 'CA', sector: 'mining', isVenture: true });
    const all = p.risks.join(' ');
    expect(all).toMatch(/Penny stock/);
    expect(all).toMatch(/TSX Venture/);
    expect(all).toMatch(/Low liquidity/);
  });

  it('never proposes a long entry on a SELL', () => {
    const sig = scoreBars(series(wave(300, 100, -0.003)));
    const p = buildPlan(sig, { market: 'US' });
    expect(p.side).toBe('none');
    expect(p.invalidation.join(' ')).toMatch(/reclaiming the 50-day/);
  });
});

describe('position sizing', () => {
  it('risks the chosen percentage of the portfolio', () => {
    const p = positionSize(100_000, 0.01, 50, 48);
    expect(p.shares).toBe(500);
    expect(p.riskAmount).toBe(1000);
    expect(p.cappedBy).toBe('risk');
  });

  it('caps at the max allocation and at available cash', () => {
    expect(positionSize(100_000, 0.02, 100, 99.5).cappedBy).toBe('maxAllocation');
    expect(positionSize(100_000, 0.02, 100, 99.5).shares).toBe(250);
    const c = positionSize(100_000, 0.01, 50, 48, { cash: 5_000 });
    expect(c.shares).toBe(100);
    expect(c.cappedBy).toBe('cash');
  });

  it('returns zero for an invalid stop', () => {
    expect(positionSize(100_000, 0.01, 50, 55).shares).toBe(0);
  });
});

describe('backtest', () => {
  it('needs enough history', () => {
    expect(backtest(series(wave(100, 10, 0.001))).tradeCount).toBe(0);
  });

  it('reports honest stats including losers and drawdown', () => {
    // rally, crash, recovery — the rule set must take losses in the crash
    const closes = [...wave(260, 50, 0.002, 0.03), ...wave(120, 50 * 1.002 ** 260, -0.004, 0.03), ...wave(150, 40, 0.003, 0.03)];
    const r = backtest(series(closes));
    expect(r.tradeCount).toBeGreaterThan(0);
    expect(r.winRate).not.toBeNull();
    expect(r.maxDrawdown).toBeLessThanOrEqual(0);
    expect(r.equity.length).toBe(closes.length - 200);
    expect(r.yearly.length).toBeGreaterThan(0);
    const compounded = r.trades.reduce((a, t) => a * (1 + t.ret), 1) - 1;
    expect(compounded).toBeCloseTo(r.totalReturn, 8);
  });

  it('applies costs: a flat market loses money round-trip', () => {
    const r = backtest(series(wave(500, 50, 0, 0.0)), { costPerSide: 0.01 });
    expect(r.totalReturn).toBeLessThanOrEqual(0);
  });
});
