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

export function upsertHistoricalPrices(identifier: string, assetClass: AssetClass, points: HistoricalPricePoint[]): void {
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

export function upsertHistoricalFxRates(base: string, quote: string, points: HistoricalFxPoint[]): void {
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

export function listAllHistoricalPrices(): HistoricalPriceRow[] {
  const rows = getDb()
    .prepare('SELECT identifier, asset_class, date, price, currency FROM historical_prices ORDER BY identifier, date')
    .all() as unknown as { identifier: string; asset_class: AssetClass; date: string; price: number; currency: string }[]
  return rows.map((r) => ({ identifier: r.identifier, assetClass: r.asset_class, date: r.date, price: r.price, currency: r.currency }))
}

export interface HistoricalFxRow {
  base: string
  quote: string
  date: string
  rate: number
}

export function listAllHistoricalFxRates(): HistoricalFxRow[] {
  const rows = getDb()
    .prepare('SELECT base, quote, date, rate FROM historical_fx_rates ORDER BY base, quote, date')
    .all() as unknown as HistoricalFxRow[]
  return rows
}
