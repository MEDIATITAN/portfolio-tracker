import { getDb } from './index'
import type { AssetClass, PriceCacheEntry } from '../../shared/types'

interface PriceCacheRow {
  identifier: string
  asset_class: AssetClass
  price: number
  currency: string
  fetched_at: string
  fetch_error: string | null
}

function rowToEntry(row: PriceCacheRow): PriceCacheEntry {
  return {
    identifier: row.identifier,
    assetClass: row.asset_class,
    price: row.price,
    currency: row.currency,
    fetchedAt: row.fetched_at,
    fetchError: row.fetch_error
  }
}

export function listPriceCache(): PriceCacheEntry[] {
  const rows = getDb().prepare('SELECT * FROM price_cache').all() as unknown as PriceCacheRow[]
  return rows.map(rowToEntry)
}

export function upsertPrice(entry: {
  identifier: string
  assetClass: AssetClass
  price: number
  currency: string
  fetchedAt: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO price_cache (identifier, asset_class, price, currency, fetched_at, fetch_error)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(identifier) DO UPDATE SET
         asset_class = excluded.asset_class,
         price = excluded.price,
         currency = excluded.currency,
         fetched_at = excluded.fetched_at,
         fetch_error = NULL`
    )
    .run(entry.identifier, entry.assetClass, entry.price, entry.currency, entry.fetchedAt)
}

export function markPriceFetchError(identifier: string, errorMessage: string): void {
  getDb().prepare('UPDATE price_cache SET fetch_error = ? WHERE identifier = ?').run(errorMessage, identifier)
}
