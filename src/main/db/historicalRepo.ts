import { getDb } from './index'
import type { AssetClass } from '../../shared/types'

export interface HistoricalPricePoint {
  date: string
  price: number
  currency: string
}

export interface HistoricalFxPoint {
  date: string
  rate: number
}

export function upsertHistoricalPrices(
  identifier: string,
  assetClass: AssetClass,
  points: HistoricalPricePoint[]
): void {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO historical_prices (identifier, asset_class, date, price, currency)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(identifier, date) DO UPDATE SET price = excluded.price, currency = excluded.currency, asset_class = excluded.asset_class`
  )
  db.exec('BEGIN')
  try {
    for (const p of points) stmt.run(identifier, assetClass, p.date, p.price, p.currency)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function upsertHistoricalFxRates(
  base: string,
  quote: string,
  points: HistoricalFxPoint[]
): void {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO historical_fx_rates (base, quote, date, rate)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(base, quote, date) DO UPDATE SET rate = excluded.rate`
  )
  db.exec('BEGIN')
  try {
    for (const p of points) stmt.run(base, quote, p.date, p.rate)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/**
 * Löscht die gespeicherte Kursreihe eines Wertpapiers, damit sie neu geholt wird.
 *
 * Nötig, weil ensureHistoricalData vorhandene Reihen bewusst NICHT erneut abruft (sonst liefe
 * bei jedem Start ein voller Verlaufsabruf über alle Positionen). Ohne vorheriges Löschen
 * bliebe ein "Zurücksetzen" also wirkungslos.
 */
export function deleteHistoricalPrices(identifier: string): void {
  getDb().prepare('DELETE FROM historical_prices WHERE identifier = ?').run(identifier)
}

/** Frühestes Datum, für das wir für diesen Identifier bereits historische Kurse haben (oder null, falls keine). */
export function earliestHistoricalDate(identifier: string): string | null {
  const row = getDb()
    .prepare('SELECT MIN(date) as minDate FROM historical_prices WHERE identifier = ?')
    .get(identifier) as unknown as { minDate: string | null } | undefined
  return row?.minDate ?? null
}

export interface HistoricalPriceRow {
  identifier: string
  assetClass: AssetClass
  date: string
  price: number
  currency: string
}

/** Jüngster gespeicherter Kurstag einer Reihe, oder null wenn es keinen gibt. */
export function latestHistoricalDate(identifier: string): string | null {
  const row = getDb()
    .prepare('SELECT MAX(date) AS d FROM historical_prices WHERE identifier = ?')
    .get(identifier) as unknown as { d: string | null } | undefined
  return row?.d ?? null
}

/**
 * Jüngster gespeicherter Kurs VOR einem Stichtag.
 *
 * Der Stichtag ist wichtig: bei jedem Kursabruf wird der Live-Kurs zusätzlich als heutiger Punkt
 * in die Reihe geschrieben. Ein Vergleich mit dem jüngsten Kurs überhaupt verglich also den
 * Live-Kurs mit sich selbst und konnte nie etwas auffälliges finden.
 */
export function latestPriceBefore(
  identifier: string,
  date: string
): { date: string; price: number; currency: string } | null {
  const row = getDb()
    .prepare(
      'SELECT date, price, currency FROM historical_prices WHERE identifier = ? AND date < ? ORDER BY date DESC LIMIT 1'
    )
    .get(identifier, date) as unknown as
    { date: string; price: number; currency: string } | undefined
  return row ?? null
}

/**
 * Kurs an diesem Tag, oder der letzte davor. Für Sparplan-Ausführungen: an einem Wochenende oder
 * Feiertag wird nicht gehandelt, der Kurs des vorherigen Handelstages ist dann der richtige.
 */
export function priceOnOrBefore(
  identifier: string,
  date: string
): { date: string; price: number; currency: string } | null {
  const row = getDb()
    .prepare(
      'SELECT date, price, currency FROM historical_prices WHERE identifier = ? AND date <= ? ORDER BY date DESC LIMIT 1'
    )
    .get(identifier, date) as unknown as
    { date: string; price: number; currency: string } | undefined
  return row ?? null
}

/** Wechselkurs an diesem Tag oder der letzte davor - Wechselkurse gibt es nur an Bankarbeitstagen. */
export function fxRateOnOrBefore(base: string, quote: string, date: string): number | null {
  const row = getDb()
    .prepare(
      'SELECT rate FROM historical_fx_rates WHERE base = ? AND quote = ? AND date <= ? ORDER BY date DESC LIMIT 1'
    )
    .get(base, quote, date) as unknown as { rate: number } | undefined
  return row?.rate ?? null
}

export function listAllHistoricalPrices(): HistoricalPriceRow[] {
  const rows = getDb()
    .prepare(
      'SELECT identifier, asset_class, date, price, currency FROM historical_prices ORDER BY identifier, date'
    )
    .all() as unknown as {
    identifier: string
    asset_class: AssetClass
    date: string
    price: number
    currency: string
  }[]
  return rows.map((r) => ({
    identifier: r.identifier,
    assetClass: r.asset_class,
    date: r.date,
    price: r.price,
    currency: r.currency
  }))
}

export interface HistoricalFxRow {
  base: string
  quote: string
  date: string
  rate: number
}

/**
 * Wechselkursreihe eines Währungspaars ab einem Stichtag.
 *
 * Für Umrechnungen über viele Tage hinweg: fxRateOnOrBefore() einzeln je Tag aufzurufen wären bei
 * einer sechsjährigen Reihe mehrere tausend Abfragen. Hier kommt die Reihe in einem Stück, der
 * Aufrufer läuft sie mit einem Zeiger ab.
 */
export function listHistoricalFxRates(
  base: string,
  quote: string,
  fromDate: string
): { date: string; rate: number }[] {
  return getDb()
    .prepare(
      'SELECT date, rate FROM historical_fx_rates WHERE base = ? AND quote = ? AND date >= ? ORDER BY date'
    )
    .all(base, quote, fromDate) as unknown as { date: string; rate: number }[]
}

export function listAllHistoricalFxRates(): HistoricalFxRow[] {
  const rows = getDb()
    .prepare('SELECT base, quote, date, rate FROM historical_fx_rates ORDER BY base, quote, date')
    .all() as unknown as HistoricalFxRow[]
  return rows
}
