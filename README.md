# 🧭 TradeCompass

TradeCompass is a mobile-first stock research and trading guide for retail investors in 🇺🇸 US and 🇨🇦 Canadian markets. It is **rule-based and explainable**. Every BUY / HOLD / SELL shows the exact reasons and points behind it, along with:
- a trade plan with entry, stop, targets and position size
- risks
- an honest backtest

> **Educational only — not financial advice.** Signals are rule-based readings of past data and are often wrong. Past performance doesn't guarantee future results.

## What's in the MVP
| Stage | Feature |
|---|---|
| 1. Data + US/CA toggle | Strictly separate US (NYSE/NASDAQ, USD) and Canadian (TSX/TSXV, CAD) universes. Prices in native currency, CAD⇄USD converter, market status with exchange holiday calendars, cached data with "last updated" labels and stale warnings. |
| 2. Signal engine | Score from −100 to +100 built from trend, momentum, volume, levels, fundamentals, macro and smart money. Label, confidence, top 3 reasons, entry/stop/targets, R/R, position size, hold-until / sell-if rules, invalidation, risks and a walk-forward backtest. See [docs/SIGNALS.md](docs/SIGNALS.md). |
| 3. Sector tabs | Gold · Silver · Copper · Oil & Gas · Semiconductors · Robotics & AI · Mining · Food & Ag · REITs · ETFs · Dividend · Watchlist. Each has trend and breadth, top movers, macro drivers and a "what moves this sector" card, plus country notes (TFSA/RRSP/FHSA, withholding, hedged ETFs). |
| 4. Smart money | SEC Form 4 insider trades and cluster buying, 13F fund holdings (new / added / trimmed / exited, with filing-delay warnings), 13D/13G, congressional trades (with an FMP key), follow-a-fund alerts. For Canada: SEDI / SEDAR+ links. |
| 5. Portfolio & alerts | Holdings in CAD/USD by account type, P/L, allocation by sector, country, currency and account, tax-placement notes, risk dashboard (concentration, correlation, hypothetical max drawdown). Alerts for price, signal change, earnings, ex-dividend and new 13F filings, delivered in-app and by web push. Paper trading with a virtual 100k account per market. Lessons and a tap-to-explain glossary. |

## Quick start (local)
Requirements: Node 22+, PostgreSQL 14+.

```bash
npm install
cp server/.env.example server/.env        # set DATABASE_URL and SEC_USER_AGENT (your email)
createdb tradecompass
npm run db:seed                           # schema + universe (117 tickers) + 9 funds + paper accounts
npm run dev                               # API on :8787, web on :5173 (proxied)
```
Open http://localhost:5173 (use your browser's device toolbar for the phone layout).

**First data load.** Signals are computed after each close by the scheduler. To populate them right away:
```bash
npm run jobs:run -w server -- fundamentals signals insiders funds
```
Opening any stock page also computes its signal on demand.

### API keys (all optional)
| Variable | Used for |
|---|---|
| — | Yahoo-compatible chart, quote, fundamentals and search endpoints. No key needed, but unofficial. Use a licensed provider in production. |
| `TWELVEDATA_API_KEY` | Fallback or primary daily bars and quotes (TSX/TSXV supported) |
| `ALPHAVANTAGE_API_KEY` | Fallback bars and fundamentals, **news with sentiment** |
| `FMP_API_KEY` | Congressional trade disclosures |
| `OPENFIGI_API_KEY` | Faster CUSIP→ticker mapping for 13F holdings |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push (`npx web-push generate-vapid-keys`) |

Provider order is set by `MARKET_DATA_PROVIDERS=yahoo,twelvedata,alphavantage`. The first provider that succeeds wins. SEC EDGAR needs no key but **requires** `SEC_USER_AGENT` with a contact email.

## Tests
```bash
npm test          # 24 signal-engine tests + 34 server tests (server tests need Postgres: TEST_DATABASE_URL or a local tradecompass_test DB)
npm run typecheck
```
Server tests never touch the network: they stub `fetch` with recorded response shapes.

## Deploy
**Docker Compose** (Postgres + app):
```bash
cp server/.env.example server/.env   # fill in SEC_USER_AGENT and any keys
docker compose up --build            # http://localhost:8787
```
**Any Node host** (Render, Fly.io, Railway, a VM):
- Build with `npm ci && npm run build`. Start with `npm start -w server`. The server serves `web/dist` and applies the schema on boot.
- Use a managed Postgres for `DATABASE_URL`.
- Keep `ENABLE_JOBS=true` on exactly **one** instance. Set it to `false` on the others, or run the jobs in a separate worker / cron with `npm run jobs:run -w server -- <job>`.
- Serve over HTTPS; service workers and push require it.

## Project layout
```
packages/signals/   pure TS signal engine (indicators, score, plan, backtest, sector profiles) + tests
server/             Fastify API, Postgres schema/seed, providers, services, scheduled jobs + tests
web/                React + Tailwind PWA (Lightweight Charts), lessons & glossary content
docs/               ARCHITECTURE.md (diagram + schema) · SIGNALS.md (formulas) · ROADMAP.md (v2)
```

## Honest limitations
- **Free data feeds** are delayed about 15 minutes and unofficial. Data is cached; when a refresh fails the UI shows a stale banner, and with no data it shows an error rather than guessing.
- **Backtests** replay only the technical rules (no point-in-time fundamentals). They are hypothetical and usually look better than real trading.
- **13F data** is up to 45 days old at filing and shows only long US-listed positions. **Canadian insider data** (SEDI) has no public API, so the app links to it instead.
- **Single-user MVP**: there is no authentication yet. See [docs/ROADMAP.md](docs/ROADMAP.md).
- Tax notes are general information, not tax advice.
