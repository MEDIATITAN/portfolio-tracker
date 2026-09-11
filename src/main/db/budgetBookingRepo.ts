import { getDb } from './index'
import type { BudgetBooking } from '../../shared/types'

interface BookingRow {
  id: number
  budget_item_id: number
  position_id: number
  month: string
  amount: number
  reverted_at: string | null
  created_at: string
}

function rowToBooking(row: BookingRow): BudgetBooking {
  return {
    id: row.id,
    budgetItemId: row.budget_item_id,
    positionId: row.position_id,
    month: row.month,
    amount: row.amount,
    revertedAt: row.reverted_at ?? null,
    createdAt: row.created_at
  }
}

/**
 * Monate, in denen dieser Posten bereits behandelt wurde - Grundlage dafür, keinen zweimal zu
 * buchen. Bewusst INKLUSIVE zurückgenommener: ein Monat, den man rückgängig gemacht hat, soll
 * nicht beim nächsten Abruf wiederkommen.
 */
export function bookedMonths(budgetItemId: number): Set<string> {
  const rows = getDb()
    .prepare('SELECT month FROM budget_bookings WHERE budget_item_id = ?')
    .all(budgetItemId) as unknown as { month: string }[]
  return new Set(rows.map((r) => r.month))
}

export function createBooking(input: {
  budgetItemId: number
  positionId: number
  month: string
  amount: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO budget_bookings (budget_item_id, position_id, month, amount)
       VALUES (?, ?, ?, ?)`
    )
    .run(input.budgetItemId, input.positionId, input.month, input.amount)
}

/** Die noch WIRKSAMEN Buchungen eines Monats - zurückgenommene sind bereits ausgeglichen. */
export function listBookingsInMonth(month: string): BudgetBooking[] {
  const rows = getDb()
    .prepare('SELECT * FROM budget_bookings WHERE month = ? AND reverted_at IS NULL ORDER BY id')
    .all(month) as unknown as BookingRow[]
  return rows.map(rowToBooking)
}

/**
 * Kennzeichnet die Buchungen eines Monats als zurückgenommen, statt sie zu löschen.
 *
 * Gelöscht dürfen sie nicht werden: bookedMonths würde den Monat danach nicht mehr kennen und der
 * nächste Kursabruf ihn sofort erneut abbuchen - die Rücknahme wäre wirkungslos.
 */
export function markRevertedInMonth(month: string): void {
  getDb()
    .prepare(
      "UPDATE budget_bookings SET reverted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE month = ? AND reverted_at IS NULL"
    )
    .run(month)
}

/** Alle noch wirksamen Buchungen, neueste zuerst. */
export function listAllBookings(): BudgetBooking[] {
  const rows = getDb()
    .prepare('SELECT * FROM budget_bookings WHERE reverted_at IS NULL ORDER BY month DESC, id')
    .all() as unknown as BookingRow[]
  return rows.map(rowToBooking)
}
