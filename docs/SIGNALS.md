# Signal-scoring algorithm

Source: [`packages/signals/src`](../packages/signals/src). It is a pure TypeScript package with no I/O, so the server and web app share it. Tests: `npm test -w @tradecompass/signals`.

## 1. Indicators (`indicators.ts`)
| Indicator | Formula |
|---|---|
| SMA(n) | mean of last n closes |
| EMA(n) | seeded with SMA(n); then `EMAₜ = Cₜ·k + EMAₜ₋₁·(1−k)`, `k = 2/(n+1)` |
| RSI(14) | Wilder: avg gain/loss seeded with simple mean over 14, then `avg = (avg·13 + x)/14`; `RSI = 100 − 100/(1 + avgGain/avgLoss)` |
| MACD | `EMA12 − EMA26`; signal `EMA9(MACD)`; histogram `MACD − signal` |
| Bollinger | `SMA20 ± 2σ` (population σ) |
| ATR(14) | Wilder-smoothed true range `max(H−L, |H−Cₜ₋₁|, |L−Cₜ₋₁|)` |
| A/D line | `Σ ((C−L) − (H−C))/(H−L) · V` |
| A/D slope | least-squares slope over 20 bars ÷ 20-day average volume |
| Support / resistance | swing lows/highs (extreme of ±3 bars) within 120 bars; nearest below / above price |
| Golden/death cross age | bars since SMA50 last crossed SMA200 (sign = direction) |

## 2. Factors and weights (`score.ts`)
Each factor produces **sub-readings** in [−1, 1] that add up to the factor value (bounded to [−1, 1]).

| Factor | Weight | Sub-readings |
|---|---:|---|
| Trend | 25 | price vs SMA200 ±0.35 · SMA50 vs SMA200 ±0.35 (text notes a cross within 20 bars) · price vs SMA50 ±0.30 |
| Momentum | 20 | RSI <30 +0.4 · 30–45 −0.1 · 45–55 0 · 55–65 +0.2 · 65–70 +0.1 · >70 −0.4. MACD: fresh bullish cross +0.6 / bearish −0.6; above signal and rising +0.4 / fading +0.15; below and falling −0.4 / improving −0.15 |
| Volume | 10 | A/D slope × 5 clipped to ±0.5 · volume ≥2× average ±0.5 (sign of the day) · ≥1.5× ±0.25 |
| Levels | 10 | close below lower Bollinger band +0.3 / above upper −0.3 · within 3% of 52w high +0.3 / within 10% of 52w low −0.3 · within 1 ATR of support +0.4 · within 1 ATR of resistance −0.4 |
| Fundamentals | 20 | mean of the available metrics (needs ≥2): P/E vs sector median (<0.8× +0.6, >1.3× −0.4, negative −0.6) · EPS growth (>15% +0.8, >0 +0.3, <0 −0.6) · revenue growth (>10% +0.6, >0 +0.2, <0 −0.6) · D/E (<0.5 +0.4, >2 −0.6) · FCF (>0 +0.5, <0 −0.6) · payout (>100% −0.6, <75% with a dividend +0.4) · P/B (<1 +0.4, >8 −0.3). REITs: P/FFO (<12 +0.6, >20 −0.4) and occupancy (≥95% +0.4, <90% −0.5). ETFs: excluded. |
| Macro | 10 | `Σ coefᵢ·dirᵢ / Σ|coefᵢ|` with dir ∈ {+1, 0, −1} from 20-day changes. Thresholds: 10Y yield ±0.10 pt, DXY ±1%, TIP÷IEF ±0.5%, commodity ±2%. Sector coefficients are in `sectors.ts` (e.g. gold: rates −1, USD −1, inflation +0.5, gold +1.5). |
| Smart money | 5 | ≥3 insider buyers in 90 d +0.6 · 1–2 +0.3 · ≥3 sellers and no buyers −0.3 · tracked funds net adding/trimming ×0.1, clipped ±0.4 |

## 3. Score, label, confidence
```
availableWeight = Σ weight of factors that have data
points(sub)     = sub.value × weight(factor) / availableWeight × 100
score           = round(Σ points)            ∈ [−100, 100]
```
Every reason carries its points, and **the reasons add up to the score**. A unit test checks this.

| Score | Label |
|---|---|
| ≥ 60 | STRONG BUY |
| 20 … 59 | BUY |
| −19 … 19 | HOLD |
| −59 … −20 | SELL |
| ≤ −60 | STRONG SELL |

`confidence = 100 × agreement × √coverage`
- `coverage` = availableWeight / 100.
- `agreement` = share of available weight whose factor value has the same sign as the score. For HOLD it is the share with |value| < 0.3.
- Levels: High ≥ 70 · Medium ≥ 45 · Low below that.

Top 3 reasons = the largest-|points| reasons pointing the same way as the score (for HOLD, by size alone).

## 4. Trade plan (`plan.ts`) — long-only
```
entryHigh = close
entryLow  = max(support, close − 0.5·ATR)
stop      = support − 0.5·ATR   if support is below entryLow and within 3·ATR of close
            entryLow − 1.5·ATR   otherwise
R         = entryMid − stop
target1   = nearest resistance if ≥ 1.5R above entryMid, else entryMid + 2R
target2   = max(entryMid + 3R, target1 + R)
R/R       = (target1 − entryMid) / R
```
- SELL / STRONG SELL return `side: 'none'`. The UI shows an exit plan for holders, plus "what would invalidate the SELL". The app **never suggests shorting**.
- Risks attached to every plan:
  - ATR% volatility
  - Penny stock (< US$5 / < C$1)
  - Illiquidity (< $1M per day)
  - TSXV junior
  - Leveraged ETF
  - Mining jurisdiction risk
  - Earnings within 14 days
  - Low confidence
  - Generic "signals are often wrong"

**Position size**:
```
shares = floor(portfolio × risk% / (entry − stop))
```
It is capped at 25% of the portfolio and at available cash. The default risk is 1% (user setting, 0.25–5%).

## 5. Backtest (`backtest.ts`)
- Walk-forward from bar 200, with no look-ahead. **Technical factors only**: fundamentals, macro and 13F are not available point-in-time, so replaying them would leak future information.
- Enter at the **next open** when score ≥ 20.
- Exit at:
  - the stop (or the open, if the price gaps through it)
  - target 2
  - the next open after the score turns ≤ −20
- 0.1% cost per side. Fully invested while in a trade.
- Reports:
  - win rate, average gain, average loss, expectancy
  - total vs buy-and-hold
  - **max drawdown** (mark-to-market)
  - exposure
  - worst trade
  - **year-by-year returns**, losing years included

## 6. Tests
- `packages/signals/test`: 24 tests. Indicator math (including hand-computed RSI), label thresholds, reasons summing to the score, missing-data re-weighting, macro direction, plan geometry and risks, position sizing caps, backtest cost and compounding consistency.
- `server/test`: 34 tests.
  - Provider parsers against recorded response shapes: Yahoo, Alpha Vantage, Twelve Data, Form 4 XML, namespaced 13F XML, FMP.
  - Market calendars (US/CA holidays, early closes).
  - API integration on real Postgres with a stubbed network: stale fallback, 503 when no data, signal-change alerts, smart money, portfolio FX, price alerts, paper trading (including rejection on stale quotes).
