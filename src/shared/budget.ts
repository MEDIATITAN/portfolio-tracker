import type { BudgetItem, BudgetPeriod } from './types'

/**
 * Wie oft ein Posten anfällt. Fixkosten sind nicht immer monatlich - Versicherungen und
 * Rundfunkbeitrag laufen jährlich oder vierteljährlich. Gespeichert wird der Betrag so, wie er
 * tatsächlich abgebucht wird; für die Übersicht wird er auf einen Monat heruntergerechnet.
 */
export const PERIOD_MONTHS: Record<BudgetPeriod, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
}

export const PERIOD_LABELS: Record<BudgetPeriod, string> = {
  MONTHLY: 'monatlich',
  QUARTERLY: 'vierteljährlich',
  YEARLY: 'jährlich'
}

export const PERIOD_ORDER: BudgetPeriod[] = ['MONTHLY', 'QUARTERLY', 'YEARLY']

/** Der auf einen Monat umgerechnete Betrag, noch in der Währung des Postens. */
export function monthlyAmount(item: Pick<BudgetItem, 'amount' | 'period'>): number {
  return item.amount / PERIOD_MONTHS[item.period]
}

/**
 * 'YYYY-MM' als "September 2026" - für die Buchungsliste und die Vermerke im Kontostands-Verlauf.
 * Liegt hier statt im Renderer, weil auch der Hauptprozess den Vermerk schreibt.
 */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return month
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
}
