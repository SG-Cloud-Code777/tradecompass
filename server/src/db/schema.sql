-- TradeCompass schema (PostgreSQL 14+). Idempotent: safe to run on every start.

create table if not exists users (
  id            serial primary key,
  email         text unique,
  base_currency text not null default 'CAD' check (base_currency in ('CAD', 'USD')),
  risk_pct      double precision not null default 0.01 check (risk_pct > 0 and risk_pct <= 0.05),
  created_at    timestamptz not null default now()
);

-- Securities we track. Prices are never stored here — only metadata.
create table if not exists securities (
  symbol        text primary key,              -- Yahoo-style: AAPL, RY.TO, SGD.V
  name          text not null,
  market        text not null check (market in ('US', 'CA')),
  exchange      text not null,                 -- NYSE, NASDAQ, NYSE Arca, TSX, TSXV, ...
  currency      text not null check (currency in ('USD', 'CAD')),
  sector        text not null,                 -- signals SectorId
  kind          text not null default 'stock' check (kind in ('stock', 'etf', 'reit')),
  is_venture    boolean not null default false,
  is_leveraged  boolean not null default false,
  cad_hedged    boolean not null default false,
  in_universe   boolean not null default true, -- false = added ad hoc by a user
  notes         text
);
create index if not exists securities_market_sector on securities (market, sector);

create table if not exists price_bars (
  symbol  text not null,
  d       date not null,
  o       double precision not null,
  h       double precision not null,
  l       double precision not null,
  c       double precision not null,
  v       bigint not null default 0,
  primary key (symbol, d)
);

create table if not exists quotes (
  symbol      text primary key,
  price       double precision not null,
  prev_close  double precision,
  change_pct  double precision,
  currency    text,
  as_of       timestamptz,                     -- exchange timestamp of the price
  source      text not null,
  fetched_at  timestamptz not null default now()
);

-- Generic JSON cache for provider responses (fundamentals, news, macro, filings, ...).
create table if not exists api_cache (
  key         text primary key,
  payload     jsonb not null,
  source      text not null,
  fetched_at  timestamptz not null default now()
);

create table if not exists signals (
  symbol       text primary key,
  as_of        date not null,                  -- date of the last bar used
  score        integer not null,
  label        text not null,
  confidence   text not null,
  payload      jsonb not null,                 -- full explainable result + plan + backtest
  computed_at  timestamptz not null default now()
);

create table if not exists signal_history (
  id          bigserial primary key,
  symbol      text not null,
  as_of       date not null,
  score       integer not null,
  label       text not null,
  prev_label  text,
  computed_at timestamptz not null default now()
);
create index if not exists signal_history_symbol on signal_history (symbol, computed_at desc);

-- Smart money -----------------------------------------------------------------
create table if not exists funds (
  id          serial primary key,
  name        text not null,
  cik         text unique,                     -- SEC CIK, 10-digit zero-padded
  country     text not null default 'US',
  style       text,                            -- value, macro, activist, index, ...
  tracked     boolean not null default true,   -- refreshed by the scheduler
  followed    boolean not null default false,  -- user gets alerts on new filings
  created_at  timestamptz not null default now()
);

create table if not exists fund_filings (
  id          serial primary key,
  fund_id     integer not null references funds (id) on delete cascade,
  accession   text not null unique,
  form        text not null,
  period      date,                            -- quarter end the holdings refer to
  filed       date not null,
  total_value bigint,
  fetched_at  timestamptz not null default now()
);
create index if not exists fund_filings_fund on fund_filings (fund_id, period desc);

create table if not exists fund_holdings (
  id          bigserial primary key,
  filing_id   integer not null references fund_filings (id) on delete cascade,
  cusip       text not null,
  issuer      text not null,
  title_class text,
  value_usd   bigint not null,
  shares      bigint not null,
  put_call    text,
  ticker      text                             -- resolved via OpenFIGI or name match; may be null
);
create index if not exists fund_holdings_filing on fund_holdings (filing_id);
create index if not exists fund_holdings_ticker on fund_holdings (ticker);
create index if not exists fund_holdings_cusip on fund_holdings (cusip);

create table if not exists insider_trades (
  id          bigserial primary key,
  symbol      text not null,
  accession   text not null,
  insider     text not null,
  role        text,
  code        text not null,                   -- P = open-market buy, S = open-market sale, ...
  shares      double precision not null,
  price       double precision,
  txn_date    date not null,
  filed       date not null,
  source      text not null default 'SEC Form 4',
  unique (accession, insider, txn_date, code, shares)
);
create index if not exists insider_trades_symbol on insider_trades (symbol, txn_date desc);

-- Portfolio, watchlist, alerts -------------------------------------------------
create table if not exists holdings (
  id             serial primary key,
  user_id        integer not null references users (id) on delete cascade,
  symbol         text not null,
  shares         double precision not null check (shares > 0),
  cost_per_share double precision not null check (cost_per_share >= 0),
  currency       text not null check (currency in ('CAD', 'USD')),
  account        text not null default 'Non-registered',
  opened_at      date,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists watchlist (
  user_id  integer not null references users (id) on delete cascade,
  symbol   text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists alert_rules (
  id                serial primary key,
  user_id           integer not null references users (id) on delete cascade,
  kind              text not null check (kind in ('price_above', 'price_below', 'signal_change', 'earnings', 'ex_dividend', 'fund_filing')),
  symbol            text,
  fund_id           integer references funds (id) on delete cascade,
  threshold         double precision,
  active            boolean not null default true,
  last_triggered_at timestamptz,
  created_at        timestamptz not null default now()
);

create table if not exists alert_events (
  id         bigserial primary key,
  user_id    integer not null references users (id) on delete cascade,
  rule_id    integer references alert_rules (id) on delete set null,
  kind       text not null,
  symbol     text,
  message    text not null,
  dedupe_key text unique,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id         serial primary key,
  user_id    integer not null references users (id) on delete cascade,
  endpoint   text not null unique,
  keys       jsonb not null,
  created_at timestamptz not null default now()
);

-- Paper trading ----------------------------------------------------------------
create table if not exists paper_accounts (
  id         serial primary key,
  user_id    integer not null references users (id) on delete cascade,
  market     text not null check (market in ('US', 'CA')),
  currency   text not null,
  cash       double precision not null,
  starting   double precision not null,
  created_at timestamptz not null default now(),
  unique (user_id, market)
);

create table if not exists paper_positions (
  account_id integer not null references paper_accounts (id) on delete cascade,
  symbol     text not null,
  shares     double precision not null,
  avg_cost   double precision not null,
  stop       double precision,
  target     double precision,
  opened_at  timestamptz not null default now(),
  primary key (account_id, symbol)
);

create table if not exists paper_trades (
  id           bigserial primary key,
  account_id   integer not null references paper_accounts (id) on delete cascade,
  symbol       text not null,
  side         text not null check (side in ('buy', 'sell')),
  shares       double precision not null,
  price        double precision not null,
  reason       text not null default 'manual',
  signal_label text,
  realized_pl  double precision,
  at           timestamptz not null default now()
);

create table if not exists job_runs (
  id          bigserial primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  detail      text
);
