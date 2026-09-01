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
}

export function createTransaction(input: NewTransaction): Transaction {
  const result = getDb()
    .prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, currency, date, broker, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.positionId,
      input.type,
      input.quantity,
      input.price,
      input.currency,
      input.date,
      input.broker,
      input.notes
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
