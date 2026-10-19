import webpush from 'web-push';
import { config } from '../config.js';
import { DEFAULT_USER_ID, q } from '../db/pool.js';

export type AlertKind = 'price_above' | 'price_below' | 'signal_change' | 'earnings' | 'ex_dividend' | 'fund_filing';

const pushEnabled = !!(config.vapid.publicKey && config.vapid.privateKey);
if (pushEnabled) webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);

export const pushInfo = () => ({ enabled: pushEnabled, publicKey: pushEnabled ? config.vapid.publicKey : null });

/** Record an in-app alert (deduplicated) and fan out a push notification when configured. */
export async function emit(e: { userId?: number; ruleId?: number | null; kind: string; symbol?: string | null; message: string; dedupeKey: string }) {
  const userId = e.userId ?? DEFAULT_USER_ID;
  const rows = await q(
    `insert into alert_events (user_id, rule_id, kind, symbol, message, dedupe_key) values ($1,$2,$3,$4,$5,$6)
     on conflict (dedupe_key) do nothing returning id`,
    [userId, e.ruleId ?? null, e.kind, e.symbol ?? null, e.message, e.dedupeKey],
  );
  if (!rows.length) return false;
  if (e.ruleId) await q(`update alert_rules set last_triggered_at = now() where id = $1`, [e.ruleId]);
  if (pushEnabled) {
    const subs = await q<{ endpoint: string; keys: any }>(`select endpoint, keys from push_subscriptions where user_id = $1`, [userId]);
    const payload = JSON.stringify({ title: e.symbol ? `TradeCompass · ${e.symbol}` : 'TradeCompass', body: e.message, url: e.symbol ? `/stock/${e.symbol}` : '/portfolio' });
    await Promise.all(
      subs.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload).catch(async (err) => {
          if (err?.statusCode === 404 || err?.statusCode === 410) await q(`delete from push_subscriptions where endpoint = $1`, [s.endpoint]);
        }),
      ),
    );
  }
  return true;
}

export async function rulesFor(kind: AlertKind, symbol?: string) {
  return q<{ id: number; user_id: number; symbol: string | null; threshold: number | null; fund_id: number | null }>(
    `select id, user_id, symbol, threshold, fund_id from alert_rules where active and kind = $1 and ($2::text is null or symbol = $2)`,
    [kind, symbol ?? null],
  );
}

/** Price alerts fire once, then deactivate (re-arm from the UI). */
export async function evaluatePriceAlerts(symbol: string, price: number) {
  for (const kind of ['price_above', 'price_below'] as const) {
    for (const r of await rulesFor(kind, symbol)) {
      if (r.threshold == null) continue;
      const hit = kind === 'price_above' ? price >= r.threshold : price <= r.threshold;
      if (!hit) continue;
      await emit({
        userId: r.user_id,
        ruleId: r.id,
        kind,
        symbol,
        message: `${symbol} ${kind === 'price_above' ? 'rose above' : 'fell below'} ${r.threshold} (last ${price.toFixed(2)})`,
        dedupeKey: `rule:${r.id}:${new Date().toISOString().slice(0, 10)}`,
      });
      await q(`update alert_rules set active = false where id = $1`, [r.id]);
    }
  }
}

export async function onSignalChange(symbol: string, prev: string, next: string, score: number, asOf: string) {
  for (const r of await rulesFor('signal_change', symbol)) {
    await emit({
      userId: r.user_id,
      ruleId: r.id,
      kind: 'signal_change',
      symbol,
      message: `Signal changed ${prev} → ${next} (score ${score}). Review the reasons before acting.`,
      dedupeKey: `sig:${r.id}:${asOf}:${next}`,
    });
  }
}

export async function onCalendarEvent(symbol: string, kind: 'earnings' | 'ex_dividend', date: string) {
  const days = Math.round((Date.parse(date) - Date.now()) / 86_400_000);
  if (days < 0 || days > 3) return;
  for (const r of await rulesFor(kind, symbol)) {
    await emit({
      userId: r.user_id,
      ruleId: r.id,
      kind,
      symbol,
      message: kind === 'earnings' ? `${symbol} reports earnings on ${date} — expect a bigger move than usual` : `${symbol} goes ex-dividend on ${date} — buy before this date to receive the dividend`,
      dedupeKey: `${kind}:${r.id}:${date}`,
    });
  }
}

export async function onFundFiling(fundId: number, fundName: string, period: string | null, accession: string) {
  for (const r of await q<{ id: number; user_id: number }>(`select id, user_id from alert_rules where active and kind = 'fund_filing' and fund_id = $1`, [fundId])) {
    await emit({
      userId: r.user_id,
      ruleId: r.id,
      kind: 'fund_filing',
      message: `${fundName} filed a new 13F${period ? ` for the quarter ending ${period}` : ''}. Remember: holdings can be up to 45 days old.`,
      dedupeKey: `13f:${r.id}:${accession}`,
    });
  }
}
