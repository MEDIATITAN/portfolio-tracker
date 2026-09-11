import { getDb } from './index'
import type {
  BudgetPeriod,
  NewSavingsPlan,
  SavingsPlan,
  SavingsPlanUpdate
} from '../../shared/types'

interface SavingsPlanRow {
  id: number
  position_id: number
  amount: number
  currency: string
  period: BudgetPeriod
  execution_day: number
  execution_time: string | null
  start_date: string
  end_date: string | null
  active: number
  notes: string | null
  created_at: string
  updated_at: string
}

function rowToPlan(row: SavingsPlanRow): SavingsPlan {
  return {
    id: row.id,
    positionId: row.position_id,
    amount: row.amount,
    currency: row.currency,
    period: row.period,
    executionDay: row.execution_day,
    executionTime: row.execution_time,
    startDate: row.start_date,
    endDate: row.end_date,
    active: row.active === 1,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listSavingsPlans(): SavingsPlan[] {
  const rows = getDb()
    .prepare('SELECT * FROM savings_plans ORDER BY id')
    .all() as unknown as SavingsPlanRow[]
  return rows.map(rowToPlan)
}

export function getSavingsPlanById(id: number): SavingsPlan {
  const row = getDb().prepare('SELECT * FROM savings_plans WHERE id = ?').get(id) as unknown as
    SavingsPlanRow | undefined
  if (!row) throw new Error(`Sparplan ${id} nicht gefunden`)
  return rowToPlan(row)
}

export function createSavingsPlan(input: NewSavingsPlan): SavingsPlan {
  const result = getDb()
    .prepare(
      `INSERT INTO savings_plans
         (position_id, amount, currency, period, execution_day, execution_time, start_date, end_date, active, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.positionId,
      input.amount,
      input.currency,
      input.period,
      input.executionDay,
      input.executionTime,
      input.startDate,
      input.endDate,
      input.active ? 1 : 0,
      input.notes
    )
  return getSavingsPlanById(Number(result.lastInsertRowid))
}

function hasOwn<T extends object>(input: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(input, key)
}

function pick<K extends keyof NewSavingsPlan>(
  input: Partial<NewSavingsPlan>,
  existing: NewSavingsPlan,
  key: K
): NewSavingsPlan[K] {
  return hasOwn(input, key) ? (input[key] as NewSavingsPlan[K]) : existing[key]
}

export function updateSavingsPlan(input: SavingsPlanUpdate): SavingsPlan {
  const existing = getSavingsPlanById(input.id)
  const merged: NewSavingsPlan = {
    positionId: pick(input, existing, 'positionId'),
    amount: pick(input, existing, 'amount'),
    currency: pick(input, existing, 'currency'),
    period: pick(input, existing, 'period'),
    executionDay: pick(input, existing, 'executionDay'),
    executionTime: pick(input, existing, 'executionTime'),
    startDate: pick(input, existing, 'startDate'),
    endDate: pick(input, existing, 'endDate'),
    active: pick(input, existing, 'active'),
    notes: pick(input, existing, 'notes')
  }
  getDb()
    .prepare(
      `UPDATE savings_plans SET
         position_id = ?, amount = ?, currency = ?, period = ?, execution_day = ?, execution_time = ?,
         start_date = ?, end_date = ?, active = ?, notes = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    )
    .run(
      merged.positionId,
      merged.amount,
      merged.currency,
      merged.period,
      merged.executionDay,
      merged.executionTime,
      merged.startDate,
      merged.endDate,
      merged.active ? 1 : 0,
      merged.notes,
      input.id
    )
  return getSavingsPlanById(input.id)
}

/**
 * Löscht einen Sparplan. Seine bereits gebuchten Ausführungen bleiben im Depot stehen - sie sind
 * echte Käufe, auch wenn der Plan nicht mehr läuft. Nur die Zuordnung wird gelöst, sonst zeigte
 * sie ins Leere.
 */
export function deleteSavingsPlan(id: number): void {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('UPDATE transactions SET savings_plan_id = NULL WHERE savings_plan_id = ?').run(id)
    db.prepare('DELETE FROM savings_plans WHERE id = ?').run(id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
