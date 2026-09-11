import { getDb } from './index'
import type {
  AssetClass,
  Transaction,
  TransactionType,
  TransactionWithPosition
} from '../../shared/types'

interface TransactionRow {
  id: number
  position_id: number
  type: TransactionType
  quantity: number
  price: number
  currency: string
  date: string
  broker: string | null
  notes: string | null
  savings_plan_id: number | null
  created_at: string
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    positionId: row.position_id,
    type: row.type,
    quantity: row.quantity,
    price: row.price,
    currency: row.currency,
    date: row.date,
    broker: row.broker,
    notes: row.notes,
    savingsPlanId: row.savings_plan_id ?? null,
    createdAt: row.created_at
  }
}

export interface NewTransaction {
  positionId: number
  type: TransactionType
  quantity: number
  price: number
  currency: string
  date: string
  broker: string | null
  notes: string | null
  /** Nur bei Buchungen, die ein Sparplan erzeugt hat. */
  savingsPlanId?: number | null
}

export function createTransaction(input: NewTransaction): Transaction {
  const result = getDb()
    .prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, currency, date, broker, notes, savings_plan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.positionId,
      input.type,
      input.quantity,
      input.price,
      input.currency,
      input.date,
      input.broker,
      input.notes,
      input.savingsPlanId ?? null
    )
  const row = getDb()
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as unknown as TransactionRow
  return rowToTransaction(row)
}

/** Hängt alle Buchungen einer Position an eine andere um - für das Zusammenführen von Doppelungen. */
export function moveTransactions(fromPositionId: number, toPositionId: number): number {
  const result = getDb()
    .prepare('UPDATE transactions SET position_id = ? WHERE position_id = ?')
    .run(toPositionId, fromPositionId)
  return Number(result.changes)
}

/** Löscht eine einzelne Buchung. Gibt die Position zurück, zu der sie gehörte, oder null. */
export function deleteTransaction(id: number): number | null {
  const row = getDb()
    .prepare('SELECT position_id FROM transactions WHERE id = ?')
    .get(id) as unknown as { position_id: number } | undefined
  if (!row) return null
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id)
  return row.position_id
}

/** Alle Buchungen, die ein bestimmter Sparplan erzeugt hat. */
export function listTransactionsByPlan(planId: number): Transaction[] {
  const rows = getDb()
    .prepare('SELECT * FROM transactions WHERE savings_plan_id = ? ORDER BY date ASC, id ASC')
    .all(planId) as unknown as TransactionRow[]
  return rows.map(rowToTransaction)
}

/**
 * Entfernt eine vorgemerkte Sparplan-Buchung dieser Position aus dem angegebenen Monat und meldet,
 * ob es eine gab.
 *
 * Damit ersetzt die echte Abrechnung des Brokers den Platzhalter, den der Sparplan vorab gebucht
 * hat, statt ihn zu verdoppeln. Der Monat ist das richtige Maß und nicht das exakte Datum: der
 * Broker führt nicht auf den Tag genau am eingestellten Termin aus, mal einen Werktag früher, mal
 * später - Stückzahl und Preis weichen ohnehin ab, sonst hätte die vorhandene
 * Doppelungserkennung des CSV-Imports schon gegriffen.
 */
export function deletePlanBookingInMonth(positionId: number, month: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT id FROM transactions
       WHERE position_id = ? AND savings_plan_id IS NOT NULL AND substr(date, 1, 7) = ?
       ORDER BY date ASC LIMIT 1`
    )
    .get(positionId, month) as unknown as { id: number } | undefined
  if (!row) return false
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(row.id)
  return true
}

export function listTransactionsByPosition(positionId: number): Transaction[] {
  const rows = getDb()
    .prepare('SELECT * FROM transactions WHERE position_id = ? ORDER BY date ASC, id ASC')
    .all(positionId) as unknown as TransactionRow[]
  return rows.map(rowToTransaction)
}

export function countTransactionsForPosition(positionId: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) c FROM transactions WHERE position_id = ?')
    .get(positionId) as unknown as {
    c: number
  }
  return row.c
}

export function listAllTransactions(): TransactionWithPosition[] {
  const rows = getDb()
    .prepare(
      `SELECT t.*, p.name as position_name, p.asset_class
       FROM transactions t
       JOIN positions p ON p.id = t.position_id
       ORDER BY t.date DESC, t.id DESC`
    )
    .all() as unknown as (TransactionRow & { position_name: string; asset_class: AssetClass })[]
  return rows.map((row) => ({
    ...rowToTransaction(row),
    positionName: row.position_name,
    assetClass: row.asset_class
  }))
}
