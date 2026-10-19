import { fileURLToPath } from 'node:url';
import { migrate } from './migrate.js';
import { pool, q } from './pool.js';
import { SEED_FUNDS, UNIVERSE } from './universe.js';

export async function seed() {
  await migrate();
  await q(`insert into users (id, email) values (1, null) on conflict (id) do nothing`);
  await q(`select setval(pg_get_serial_sequence('users','id'), greatest((select max(id) from users), 1))`);
  for (const s of UNIVERSE) {
    await q(
      `insert into securities (symbol, name, market, exchange, currency, sector, kind, is_venture, is_leveraged, cad_hedged, in_universe, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
       on conflict (symbol) do update set name=excluded.name, market=excluded.market, exchange=excluded.exchange,
         currency=excluded.currency, sector=excluded.sector, kind=excluded.kind, is_venture=excluded.is_venture,
         is_leveraged=excluded.is_leveraged, cad_hedged=excluded.cad_hedged, in_universe=true, notes=excluded.notes`,
      [s.symbol, s.name, s.market, s.exchange, s.currency, s.sector, s.kind, s.isVenture, s.isLeveraged, s.cadHedged, s.notes],
    );
  }
  for (const f of SEED_FUNDS) {
    await q(
      `insert into funds (name, cik, country, style, tracked) values ($1,$2,$3,$4,$5)
       on conflict (cik) do update set name=excluded.name, country=excluded.country, style=excluded.style`,
      [f.name, f.cik, f.country, f.style, f.tracked],
    );
  }
  for (const market of ['US', 'CA']) {
    await q(
      `insert into paper_accounts (user_id, market, currency, cash, starting) values (1, $1, $2, 100000, 100000)
       on conflict (user_id, market) do nothing`,
      [market, market === 'US' ? 'USD' : 'CAD'],
    );
  }
  return { securities: UNIVERSE.length, funds: SEED_FUNDS.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed()
    .then((r) => {
      console.log(`Seeded ${r.securities} securities, ${r.funds} funds, default user and paper accounts.`);
      return pool.end();
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
