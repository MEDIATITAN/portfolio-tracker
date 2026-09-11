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
  account_position_id: number | null
  account_since: string | null
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
    accountPositionId: row.account_position_id ?? null,
    accountSince: row.account_since ?? null,
    active: row.active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Ab welchem Monat ein neuer Posten auf sein Konto bucht: ab dem laufenden. Ohne Konto bleibt das
 * Feld leer.
 */
function accountSinceFor(input: NewBudgetItem): string | null {
  if (input.accountPositionId === null) return null
  return input.accountSince ?? currentMonth()
}

/**
 * Der Startmonat beim Ändern eines Postens.
 *
 * Bleibt das Konto dasselbe, bleibt auch der Startmonat stehen - sonst würde jede kleine Änderung
 * am Posten die bisherigen Buchungen ungültig machen. Wird ein Konto neu gesetzt, beginnt die
 * Buchung im laufenden Monat; wird es entfernt, verschwindet auch der Startmonat.
 */
function nextAccountSince(existing: BudgetItem, accountPositionId: number | null): string | null {
  if (accountPositionId === null) return null
  if (existing.accountPositionId === accountPositionId && existing.accountSince !== null) {
    return existing.accountSince
  }
  return currentMonth()
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
      `INSERT INTO budget_items (type, name, amount, currency, period, category, account_position_id, account_since, active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.type,
      input.name,
      input.amount,
      input.currency,
      input.period,
      input.category,
      input.accountPositionId,
      accountSinceFor(input),
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
    accountPositionId: pick(input, existing, 'accountPositionId'),
    active: pick(input, existing, 'active'),
    notes: pick(input, existing, 'notes')
  }
  getDb()
    .prepare(
      `UPDATE budget_items SET
        type = ?, name = ?, amount = ?, currency = ?, period = ?, category = ?,
        account_position_id = ?, account_since = ?, active = ?, notes = ?,
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
      merged.accountPositionId,
      nextAccountSince(existing, merged.accountPositionId),
      merged.active ? 1 : 0,
      merged.notes,
      input.id
    )
  return getBudgetItemById(input.id)
}

export function deleteBudgetItem(id: number): void {
  getDb().prepare('DELETE FROM budget_items WHERE id = ?').run(id)
}
