import type { CashSubType, CashType } from '@shared/types'
import type { DisplayClass } from '@shared/displayClass'

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 })
const shareFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return eurFormatter.format(value)
}

/** Betrag in beliebiger Notierungswährung (z.B. USD bei US-Aktien) - im Gegensatz zu formatEur. */
export function formatMoney(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '–'
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value)
  } catch {
    // Unbekannter Währungscode: lieber Zahl + Code zeigen als gar nichts.
    return `${numberFormatter.format(value)} ${currency}`
  }
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return numberFormatter.format(value)
}

const percentFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero'
})

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return `${percentFormatter.format(value)} %`
}

/**
 * Ein Anteil (0..1) als Prozentangabe OHNE Vorzeichen - für Aufteilungen.
 *
 * Nicht formatPercent nehmen: das setzt bewusst immer ein Vorzeichen (für Renditen und
 * Abweichungen richtig), bei "Aktien: +72,4 %" wäre es schlicht falsch.
 */
export function formatShare(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–'
  return `${shareFormatter.format(value * 100)} %`
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '–'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

/** Für reine Datumswerte ohne Uhrzeit, z.B. das Kaufdatum ('YYYY-MM-DD'). */
export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '–'
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '–'
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export const ASSET_CLASS_LABELS: Record<DisplayClass, string> = {
  STOCK_ETF: 'Aktien & ETFs',
  BOND: 'Anleihen',
  CRYPTO: 'Kryptowährungen',
  COMMODITY: 'Rohstoffe & Edelmetalle',
  CASH_OTHER: 'Cash & Sonstiges'
}

export const CASH_TYPE_LABELS: Record<CashType, string> = {
  CHECKING: 'Girokonto',
  SAVINGS: 'Tagesgeldkonto',
  PHYSICAL: 'Bargeld',
  FOREIGN: 'Fremdwährung',
  WORK: 'Arbeit'
}

export const CASH_SUB_TYPE_LABELS: Record<CashSubType, string> = {
  CASH: 'Cash / Tagesgeld',
  BOND: 'Anleihe',
  REAL_ESTATE: 'Immobilie',
  OTHER: 'Sonstiges'
}
