import { getDb } from './index'
import type { CashBalanceEntry, CashBalanceSource } from '../../shared/types'

interface CashBalanceRow {
  id: number
  position_id: number
  recorded_at: string
  balance: number
  currency: string
  source: CashBalanceSource
  note: string | null
}

function rowToEntry(row: CashBalanceRow): CashBalanceEntry {
  return {
    id: row.id,
    positionId: row.position_id,
    recordedAt: row.recorded_at,
    balance: row.balance,
    currency: row.currency,
    source: row.source,
    note: row.note
  }
}

export interface NewCashBalanceEntry {
  positionId: number
  balance: number
  currency: string
  source: CashBalanceSource
  note: string | null
  /** Zeitpunkt der Änderung; fehlt er, gilt jetzt. Gesetzt nur beim Nachtragen des Anfangsstands. */
  recordedAt?: string
}

export function recordBalance(input: NewCashBalanceEntry): void {
  getDb()
    .prepare(
      `INSERT INTO cash_balance_history (position_id, recorded_at, balance, currency, source, note)
       VALUES (?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')), ?, ?, ?, ?)`
    )
    .run(
      input.positionId,
      input.recordedAt ?? null,
      input.balance,
      input.currency,
      input.source,
      input.note
    )
}

/** Alle Einträge, chronologisch; bei gleichem Zeitstempel entscheidet die Einfügereihenfolge. */
export function listAll(): CashBalanceEntry[] {
  const rows = getDb()
    .prepare('SELECT * FROM cash_balance_history ORDER BY recorded_at ASC, id ASC')
    .all() as unknown as CashBalanceRow[]
  return rows.map(rowToEntry)
}

/** Positionen, die schon einen Eintrag haben - für das Nachtragen des Anfangsstands. */
export function positionIdsWithHistory(): Set<number> {
  const rows = getDb()
    .prepare('SELECT DISTINCT position_id FROM cash_balance_history')
    .all() as unknown as { position_id: number }[]
  return new Set(rows.map((r) => r.position_id))
}
