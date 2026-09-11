import * as budgetRepo from '../db/budgetRepo'
import * as budgetBookingRepo from '../db/budgetBookingRepo'
import * as positionsRepo from '../db/positionsRepo'
import * as fxRepo from '../db/fxRepo'
import { monthlyAmount } from '../../shared/budget'
import { findFxRate } from '../../shared/valueCalc'
import type { BudgetBookingMonth, BudgetItem, Position } from '../../shared/types'

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Alle Monate von `from` bis einschließlich `to`, beide als 'YYYY-MM'. */
export function monthsFrom(from: string, to: string): string[] {
  const months: string[] = []
  let [year, month] = from.split('-').map(Number)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return months
  for (let guard = 0; guard < 600; guard++) {
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
    if (iso > to) break
    months.push(iso)
    month++
    if (month > 12) {
      month = 1
      year++
    }
  }
  return months
}

/**
 * Der Betrag, um den ein Posten den Kontostand in einem Monat verändert - in der Währung des
 * KONTOS, mit Vorzeichen: Einnahmen positiv, Fixkosten negativ.
 *
 * Gebucht wird der auf den Monat heruntergerechnete Betrag, nicht der Abbuchungsbetrag: bei einer
 * vierteljährlichen Zahlung ist nicht bekannt, in welchen Monaten sie tatsächlich abgeht. Ein
 * Zwölftel jeden Monat trifft die Summe übers Jahr genau und ist dieselbe Zahl, die in der Spalte
 * "pro Monat" steht.
 */
function signedAmount(item: BudgetItem, account: Position): number | null {
  const rate = findFxRate(fxRepo.listFxRates(), item.currency, account.currency)
  if (rate === null) return null
  const value = monthlyAmount(item) * rate
  return item.type === 'INCOME' ? value : -value
}

function applyToAccount(position: Position, delta: number): void {
  const before = position.manualValue ?? 0
  positionsRepo.updatePosition({ id: position.id, manualValue: before + delta })
}

/**
 * Bucht alle fälligen Monate auf die zugeordneten Konten und liefert die Zahl der Buchungen.
 *
 * Läuft bei jedem Kursabruf mit. Ein Monat, der schon gebucht ist, wird übersprungen - dafür sorgt
 * neben der Prüfung hier auch eine UNIQUE-Bedingung in der Datenbank, damit selbst zwei gleichzeitig
 * laufende Abrufe nicht doppelt abbuchen können.
 */
export function runDueBookings(): number {
  const now = currentMonth()
  const positions = new Map(positionsRepo.listPositions().map((p) => [p.id, p]))
  let booked = 0

  for (const item of budgetRepo.listBudgetItems()) {
    if (!item.active || item.accountPositionId === null || item.accountSince === null) continue
    const account = positions.get(item.accountPositionId)
    // Nur Guthaben haben einen Kontostand, den man verändern kann.
    if (!account || account.assetClass !== 'CASH_OTHER') continue

    const already = budgetBookingRepo.bookedMonths(item.id)
    for (const month of monthsFrom(item.accountSince, now)) {
      if (already.has(month)) continue
      const amount = signedAmount(item, account)
      if (amount === null) continue

      budgetBookingRepo.createBooking({
        budgetItemId: item.id,
        positionId: account.id,
        month,
        amount
      })
      // Den Kontostand frisch lesen: mehrere Posten können auf dasselbe Konto buchen, und die
      // Kopie aus der Map wäre nach der ersten Buchung veraltet.
      applyToAccount(positionsRepo.getPositionById(account.id), amount)
      booked++
    }
  }

  if (booked > 0) console.log(`Budget: ${booked} Monatsbuchung(en) auf Konten verbucht`)
  return booked
}

/** Nimmt alle Buchungen eines Monats zurück und stellt die Kontostände wieder her. */
export function undoMonth(month: string): void {
  const bookings = budgetBookingRepo.listBookingsInMonth(month)
  for (const booking of bookings) {
    const account = positionsRepo.listPositions().find((p) => p.id === booking.positionId)
    if (!account) continue
    applyToAccount(account, -booking.amount)
  }
  budgetBookingRepo.markRevertedInMonth(month)
  if (bookings.length > 0) {
    console.log(`Budget: ${bookings.length} Buchung(en) aus ${month} zurückgenommen`)
  }
}

/** Die gebuchten Monate mit ihrer Summe in Euro - für die Liste auf der Budget-Seite. */
export function listBookingMonths(): BudgetBookingMonth[] {
  const positions = new Map(positionsRepo.listPositions().map((p) => [p.id, p]))
  const rates = fxRepo.listFxRates()
  const byMonth = new Map<string, { count: number; netEur: number }>()

  for (const booking of budgetBookingRepo.listAllBookings()) {
    const account = positions.get(booking.positionId)
    const rate = account ? findFxRate(rates, account.currency, 'EUR') : null
    const entry = byMonth.get(booking.month) ?? { count: 0, netEur: 0 }
    entry.count++
    entry.netEur += rate === null ? 0 : booking.amount * rate
    byMonth.set(booking.month, entry)
  }

  return [...byMonth.entries()]
    .map(([month, e]) => ({ month, count: e.count, netEur: e.netEur }))
    .sort((a, b) => b.month.localeCompare(a.month))
}
