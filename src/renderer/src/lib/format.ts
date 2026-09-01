import type { CashSubType } from '@shared/types'
import type { DisplayClass } from '@shared/displayClass'

const eurFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const numberFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 })

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

export const CASH_SUB_TYPE_LABELS: Record<CashSubType, string> = {
  CASH: 'Cash / Tagesgeld',
  BOND: 'Anleihe',
  REAL_ESTATE: 'Immobilie',
  OTHER: 'Sonstiges'
}
