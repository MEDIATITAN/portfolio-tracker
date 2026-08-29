import { getDb } from './index'
import type { FxRate } from '../../shared/types'

interface FxRateRow {
  base: string
  quote: string
  rate: number
  fetched_at: string
}

function rowToRate(row: FxRateRow): FxRate {
  return { base: row.base, quote: row.quote, rate: row.rate, fetchedAt: row.fetched_at }
}

export function listFxRates(): FxRate[] {
  const rows = getDb().prepare('SELECT * FROM fx_rates').all() as unknown as FxRateRow[]
  return rows.map(rowToRate)
}

export function upsertFxRate(rate: { base: string; quote: string; rate: number; fetchedAt: string }): void {
  getDb()
    .prepare(
      `INSERT INTO fx_rates (base, quote, rate, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(base, quote) DO UPDATE SET rate = excluded.rate, fetched_at = excluded.fetched_at`
    )
    .run(rate.base, rate.quote, rate.rate, rate.fetchedAt)
}
