# Roadmap

## MVP gaps to close next
- **Auth & multi-user.** The MVP acts as a single user (`DEFAULT_USER_ID = 1`). Add sessions (passkeys or OAuth), scope every query by `user_id` (the schema already supports it) and add rate limiting.
- **Licensed market data.** Yahoo-compatible endpoints are unofficial, so switch production to Polygon or Twelve Data paid plans (the adapter is already there). Add an exchange-licensing review for TSX real-time data.
- **Canadian insider feed.** SEDI has no API. Options: a licensed feed (e.g. CanadianInsider / INK Research), or a SEDI scraper that respects its terms. Then compute Canadian insider clusters like the US ones.
- **REIT fundamentals.** FFO, AFFO and occupancy are not in free feeds. Source them from filings or a fundamentals vendor so the REIT branch of the fundamentals factor activates.
- **Inflation from CPI.** Add FRED CPI (free key) alongside the TIP÷IEF market proxy.
- **Point-in-time fundamentals** for honest backtests of the full factor set.

## v2
1. **Broker integration (read-only first).** Import holdings and transactions from Questrade, Wealthsimple (via SnapTrade), Interactive Brokers and Alpaca. Then order tickets that pre-fill the plan (limit at the entry zone, stop, target). The user always confirms. No auto-trading.
2. **AI explanations of signals.** Have an LLM turn the structured payload (factors, reasons, plan, backtest, filings) into a plain-English brief and answer follow-ups ("why is macro negative for this miner?"). It must be grounded only in the payload, cite the numbers, and avoid predictive or "guaranteed" language (enforced by output checks). Keep it as a separate layer: it explains the rules and never changes the score.
3. **Tax-loss harvesting.** Flag non-registered positions with unrealized losses and suggest similar-but-not-identical replacements (e.g. XIU ↔ ZCN). Enforce Canada's 30-day superficial-loss rule (and the US wash-sale rule for US accounts), including purchases in a spouse's account or a TFSA/RRSP.
4. **Strategy lab.** Users tweak weights and thresholds, see the walk-forward backtest, and compare it to the default rules with out-of-sample periods.
5. **Native apps.** Wrap the PWA (Capacitor) for App Store / Play push and widgets.
6. **More smart money.** Activist 13D text summaries, Canadian early-warning reports (10% threshold), and pension-plan annual holdings.
7. **Dividend calendar & DRIP projections.**
8. **Compliance hardening.** A legal review of disclaimers, record-keeping of the signals shown to users, and an accessibility audit (WCAG 2.2 AA).
