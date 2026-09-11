import type { BudgetPeriod } from './types'
import { PERIOD_MONTHS } from './budget'

/**
 * Was der Rechner ausrechnen soll. Die jeweils gesuchte Größe wird im Formular ausgeblendet, alle
 * anderen sind Eingaben - so wie beim Sparrechner von Finanzfluss.
 */
export type SolveFor = 'FINAL' | 'RATE' | 'YEARS' | 'RETURN'

export interface SavingsCalcInput {
  /** Einmalbetrag zu Beginn. */
  initial: number
  /** Betrag je Sparintervall. */
  rate: number
  period: BudgetPeriod
  /** Erwartete Rendite pro Jahr in Prozent, z.B. 7 für 7 %. */
  returnPercent: number
  years: number
  /** Zielkapital - nur nötig, wenn nach Sparrate, Laufzeit oder Rendite gesucht wird. */
  target: number
  /** Kapitalertragsteuer auf den Gewinn am Ende, in Prozent. 0 = keine Steuer. */
  taxPercent: number
  /**
   * Teilfreistellung in Prozent: bei Aktienfonds und ETFs mit mindestens 51 % Aktienanteil sind
   * 30 % des Gewinns steuerfrei. Nur wirksam, wenn eine Steuer gesetzt ist.
   */
  taxExemptionPercent: number
}

export interface YearRow {
  year: number
  /** Summe aller Einzahlungen bis Ende des Jahres, inklusive Anfangskapital. */
  contributed: number
  /** Depotwert am Ende des Jahres. */
  value: number
  /** Der Anteil daran, der aus Rendite stammt. */
  gain: number
}

export interface SavingsCalcResult {
  /** Depotwert am Ende der Laufzeit, vor Steuern. */
  finalValue: number
  /** Alles, was eingezahlt wurde - Anfangskapital plus alle Raten. */
  contributed: number
  /** Wertzuwachs vor Steuern. */
  gain: number
  /** Steuer auf den Gewinn, 0 wenn keine gewählt ist. */
  tax: number
  /** Depotwert nach Abzug der Steuer. */
  finalAfterTax: number
  /** Verlauf je Jahr, für Diagramm und Tabelle. Enthält Jahr 0 als Startpunkt. */
  rows: YearRow[]
  /** Die gesuchte Größe, wenn nicht das Endkapital berechnet wurde (Rate, Jahre oder Prozent). */
  solved: number | null
  /** Gesetzt, wenn sich die gesuchte Größe nicht bestimmen ließ. */
  error: string | null
}

/** Zahl der Sparraten pro Jahr: 12, 4 oder 1. */
export function ratesPerYear(period: BudgetPeriod): number {
  return 12 / PERIOD_MONTHS[period]
}

/**
 * Zinssatz je Sparintervall, aus der Jahresrendite.
 *
 * Bewusst die effektive Umrechnung (zwölfte Wurzel bei monatlich) statt "Jahreszins geteilt durch
 * zwölf": nur so ergeben zwölf verzinste Monate am Ende exakt die angegebene Jahresrendite. Die
 * einfache Division würde durch den Zinseszins jedes Jahr etwas zu viel liefern.
 */
export function periodRate(returnPercent: number, period: BudgetPeriod): number {
  return Math.pow(1 + returnPercent / 100, 1 / ratesPerYear(period)) - 1
}

/**
 * Depotwert nach `years` Jahren.
 *
 * Gerechnet wird vorschüssig: die Rate wird zu BEGINN des Intervalls eingezahlt und verzinst sich
 * in diesem Intervall bereits mit - so laufen Sparpläne tatsächlich, der Kauf findet ja am Anfang
 * des Monats statt.
 */
function valueAfterPeriods(initial: number, rate: number, i: number, n: number): number {
  if (n <= 0) return initial
  // Ohne Verzinsung greift die Zinsformel nicht (Division durch null) - dann ist es eine reine Summe.
  if (Math.abs(i) < 1e-12) return initial + rate * n
  const growth = Math.pow(1 + i, n)
  return initial * growth + rate * ((growth - 1) / i) * (1 + i)
}

export function futureValue(
  initial: number,
  rate: number,
  returnPercent: number,
  years: number,
  period: BudgetPeriod
): number {
  return valueAfterPeriods(
    initial,
    rate,
    periodRate(returnPercent, period),
    Math.round(years * ratesPerYear(period))
  )
}

/**
 * Sucht den Wert, bei dem `f` das Ziel trifft - für Laufzeit und Rendite, die sich nicht nach einer
 * Formel auflösen lassen. Bisektion: das Intervall wird halbiert, bis es eng genug ist. Setzt
 * voraus, dass `f` steigt, was für beide Größen gilt (länger sparen und höhere Rendite ergeben
 * beide mehr Endkapital).
 */
function bisect(f: (x: number) => number, target: number, lo: number, hi: number): number | null {
  if (f(lo) > target || f(hi) < target) return null
  let a = lo
  let b = hi
  for (let step = 0; step < 200; step++) {
    const mid = (a + b) / 2
    if (f(mid) < target) a = mid
    else b = mid
    if (b - a < 1e-9) break
  }
  return (a + b) / 2
}

function yearRows(
  initial: number,
  rate: number,
  returnPercent: number,
  years: number,
  period: BudgetPeriod
): YearRow[] {
  const per = ratesPerYear(period)
  const rows: YearRow[] = [{ year: 0, contributed: initial, value: initial, gain: 0 }]
  const add = (y: number): void => {
    const value = futureValue(initial, rate, returnPercent, y, period)
    const contributed = initial + rate * Math.round(y * per)
    rows.push({ year: y, contributed, value, gain: value - contributed })
  }
  const whole = Math.max(0, Math.floor(years + 1e-9))
  for (let y = 1; y <= whole; y++) add(y)
  // Endet die Laufzeit mitten im Jahr (kommt bei der gesuchten Laufzeit vor), bekommt der Verlauf
  // einen letzten Punkt genau am Ende - sonst wiche die Kurve vom ausgewiesenen Endkapital ab.
  if (years - whole > 1e-9) add(years)
  return rows
}

export function calculateSavings(input: SavingsCalcInput, solveFor: SolveFor): SavingsCalcResult {
  const { initial, period, target } = input
  let { rate, years, returnPercent } = input
  let solved: number | null = null
  let error: string | null = null

  if (solveFor === 'RATE') {
    // Nach der Rate lässt sich die Formel direkt auflösen.
    const n = Math.round(years * ratesPerYear(period))
    const i = periodRate(returnPercent, period)
    const growth = Math.pow(1 + i, n)
    const factor = Math.abs(i) < 1e-12 ? n : ((growth - 1) / i) * (1 + i)
    if (n <= 0 || factor <= 0) {
      error = 'Die Laufzeit muss größer als null sein.'
    } else {
      rate = (target - initial * growth) / factor
      if (rate < 0) {
        rate = 0
        error = 'Das Anfangskapital erreicht das Ziel bereits von allein - es ist keine Rate nötig.'
      }
      solved = rate
    }
  } else if (solveFor === 'YEARS') {
    // Gesucht wird über die Zahl der RATEN, nicht über Jahre: die Zeit läuft in ganzen
    // Einzahlungen, und aufgerundet wird auf die Rate, mit der das Ziel erreicht ist. Über Jahre
    // gesucht landete das Ergebnis am unteren Rand der Stufe - aus 15 Jahren wurden 14,96.
    const per = ratesPerYear(period)
    const i = periodRate(returnPercent, period)
    const found = bisect((n) => valueAfterPeriods(initial, rate, i, n), target, 0, 100 * per)
    if (found === null) {
      error =
        'Mit dieser Rate und Rendite wird das Ziel auch in 100 Jahren nicht erreicht - oder es ist von Anfang an übertroffen.'
    } else {
      years = Math.ceil(found - 1e-9) / per
      solved = years
    }
  } else if (solveFor === 'RETURN') {
    const found = bisect((r) => futureValue(initial, rate, r, years, period), target, -99, 100)
    if (found === null) {
      error =
        'Dieses Ziel ist mit den übrigen Angaben nicht erreichbar - selbst 100 % Rendite pro Jahr genügen nicht, oder die Einzahlungen übertreffen es bereits.'
    } else {
      returnPercent = found
      solved = found
    }
  }

  const finalValue = futureValue(initial, rate, returnPercent, years, period)
  // Über die Zahl der Raten, nicht über volle Jahre: eine Laufzeit von 15 Jahren und einem Monat
  // hat 181 Einzahlungen, nicht 180.
  const contributed = initial + rate * Math.round(years * ratesPerYear(period))
  const gain = finalValue - contributed
  // Besteuert wird nur der Gewinn, und davon der nicht freigestellte Teil.
  const taxable = Math.max(0, gain) * (1 - input.taxExemptionPercent / 100)
  const tax = taxable * (input.taxPercent / 100)

  return {
    finalValue,
    contributed,
    gain,
    tax,
    finalAfterTax: finalValue - tax,
    rows: yearRows(initial, rate, returnPercent, years, period),
    solved,
    error
  }
}
