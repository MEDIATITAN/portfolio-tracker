import { getDb } from './index'

export interface BenchmarkPricePoint {
  date: string
  price: number
  currency: string
}

export interface BenchmarkPriceRow extends BenchmarkPricePoint {
  identifier: string
}

export function upsertBenchmarkPrices(identifier: string, points: BenchmarkPricePoint[]): void {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO benchmark_prices (identifier, date, price, currency)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(identifier, date) DO UPDATE SET price = excluded.price, currency = excluded.currency`
  )
  db.exec('BEGIN')
  try {
    for (const p of points) stmt.run(identifier, p.date, p.price, p.currency)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Frühestes gespeichertes Datum dieser Reihe, oder null wenn noch nichts geladen wurde. */
export function earliestBenchmarkDate(identifier: string): string | null {
  const row = getDb()
    .prepare('SELECT MIN(date) AS d FROM benchmark_prices WHERE identifier = ?')
    .get(identifier) as unknown as { d: string | null } | undefined
  return row?.d ?? null
}

export function latestBenchmarkDate(identifier: string): string | null {
  const row = getDb()
    .prepare('SELECT MAX(date) AS d FROM benchmark_prices WHERE identifier = ?')
    .get(identifier) as unknown as { d: string | null } | undefined
  return row?.d ?? null
}

/**
 * Alle Kurspunkte der genannten Reihen ab einem Stichtag.
 *
 * Die Identifier kommen aus einer festen Liste im Code (BENCHMARK_UNIVERSES), nie aus einer
 * Nutzereingabe - trotzdem werden sie als Parameter gebunden und nicht in den SQL-Text geschrieben.
 */
export function listBenchmarkPrices(identifiers: string[], fromDate: string): BenchmarkPriceRow[] {
  if (identifiers.length === 0) return []
  const placeholders = identifiers.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(
      `SELECT identifier, date, price, currency FROM benchmark_prices
       WHERE identifier IN (${placeholders}) AND date >= ?
       ORDER BY identifier, date`
    )
    .all(...identifiers, fromDate) as unknown as BenchmarkPriceRow[]
  return rows
}
