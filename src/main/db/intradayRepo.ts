import { getDb } from './index'
import type { AssetClass, IntradayPriceEntry } from '../../shared/types'

/**
 * Stundenkurse der letzten Tage - eigene Tabelle statt einer Erweiterung von historical_prices.
 *
 * Deren Schlüssel ist (identifier, date) ohne Uhrzeit, und daran hängt der gesamte Tagesverlauf.
 * Ihn um eine Zeitkomponente zu erweitern hieße, die Tabelle neu aufzubauen und jede Abfrage
 * darauf anzufassen - für eine Reihe, die ohnehin nur wenige Tage weit zurückreichen muss.
 */

export function upsertIntradayPrices(
  identifier: string,
  assetClass: AssetClass,
  points: { ts: string; price: number; currency: string }[]
): void {
  if (points.length === 0) return
  const stmt = getDb().prepare(
    `INSERT INTO intraday_prices (identifier, asset_class, ts, price, currency)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(identifier, ts) DO UPDATE SET
       price = excluded.price,
       currency = excluded.currency`
  )
  for (const p of points) stmt.run(identifier, assetClass, p.ts, p.price, p.currency)
}

export function listAllIntradayPrices(): IntradayPriceEntry[] {
  const rows = getDb()
    .prepare('SELECT identifier, asset_class, ts, price, currency FROM intraday_prices ORDER BY ts')
    .all() as unknown as {
    identifier: string
    asset_class: AssetClass
    ts: string
    price: number
    currency: string
  }[]
  return rows.map((r) => ({
    identifier: r.identifier,
    assetClass: r.asset_class,
    ts: r.ts,
    price: r.price,
    currency: r.currency
  }))
}

/**
 * Stundenkurs zu einem Zeitpunkt: die letzte Kerze an oder vor `ts`, aber nicht älter als
 * `notBefore`. Die Untergrenze ist wichtig - ohne sie käme für eine Uhrzeit, zu der die Börse
 * längst geschlossen war, die Kerze vom Vortag zurück und wäre schlechter als der Tagesschlusskurs.
 */
export function intradayPriceAt(
  identifier: string,
  ts: string,
  notBefore: string
): { ts: string; price: number; currency: string } | null {
  const row = getDb()
    .prepare(
      `SELECT ts, price, currency FROM intraday_prices
       WHERE identifier = ? AND ts <= ? AND ts >= ?
       ORDER BY ts DESC LIMIT 1`
    )
    .get(identifier, ts, notBefore) as unknown as
    { ts: string; price: number; currency: string } | undefined
  return row ?? null
}

/** Jüngster gespeicherter Zeitpunkt einer Reihe, oder null. */
export function latestIntradayTs(identifier: string): string | null {
  const row = getDb()
    .prepare('SELECT MAX(ts) AS t FROM intraday_prices WHERE identifier = ?')
    .get(identifier) as unknown as { t: string | null } | undefined
  return row?.t ?? null
}

/** Hält die Tabelle klein: alles vor `cutoffTs` fliegt raus. */
export function pruneIntradayBefore(cutoffTs: string): void {
  getDb().prepare('DELETE FROM intraday_prices WHERE ts < ?').run(cutoffTs)
}
