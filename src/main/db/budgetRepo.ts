import { getDb } from './index'
import type {
  BudgetItem,
  BudgetItemType,
  BudgetPeriod,
  BudgetItemUpdate,
  NewBudgetItem
} from '../../shared/types'

interface BudgetRow {
  id: number
  type: BudgetItemType
  name: string
  amount: number
  currency: string
  period: BudgetPeriod
  category: string | null
  active: number
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToItem(row: BudgetRow): BudgetItem {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    period: row.period,
    category: row.category,
    active: row.active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listBudgetItems(): BudgetItem[] {
  const rows = getDb()
    .prepare('SELECT * FROM budget_items ORDER BY type, name')
    .all() as unknown as BudgetRow[]
  return rows.map(rowToItem)
}

export function getBudgetItemById(id: number): BudgetItem {
  const row = getDb().prepare('SELECT * FROM budget_items WHERE id = ?').get(id) as unknown as
    BudgetRow | undefined
  if (!row) throw new Error(`Budgetposten ${id} nicht gefunden`)
  return rowToItem(row)
}

export function createBudgetItem(input: NewBudgetItem): BudgetItem {
  const result = getDb()
    .prepare(
      `INSERT INTO budget_items (type, name, amount, currency, period, category, active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.type,
      input.name,
      input.amount,
      input.currency,
      input.period,
      input.category,
      input.active ? 1 : 0,
      input.notes
    )
  return getBudgetItemById(Number(result.lastInsertRowid))
}

function hasOwn<T extends object>(input: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function pick<K extends keyof NewBudgetItem>(
  input: Partial<NewBudgetItem>,
  existing: NewBudgetItem,
  key: K
): NewBudgetItem[K] {
  return hasOwn(input, key) ? (input[key] as NewBudgetItem[K]) : existing[key]
}

export function updateBudgetItem(input: BudgetItemUpdate): BudgetItem {
  const existing = getBudgetItemById(input.id)
  const merged: NewBudgetItem = {
    type: pick(input, existing, 'type'),
    name: pick(input, existing, 'name'),
    amount: pick(input, existing, 'amount'),
    currency: pick(input, existing, 'currency'),
    period: pick(input, existing, 'period'),
    category: pick(input, existing, 'category'),
    active: pick(input, existing, 'active'),
    notes: pick(input, existing, 'notes')
  }
  getDb()
    .prepare(
      `UPDATE budget_items SET
        type = ?, name = ?, amount = ?, currency = ?, period = ?, category = ?, active = ?, notes = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    )
    .run(
      merged.type,
      merged.name,
      merged.amount,
      merged.currency,
      merged.period,
      merged.category,
      merged.active ? 1 : 0,
      merged.notes,
      input.id
    )
  return getBudgetItemById(input.id)
}

export function deleteBudgetItem(id: number): void {
  getDb().prepare('DELETE FROM budget_items WHERE id = ?').run(id)
}
