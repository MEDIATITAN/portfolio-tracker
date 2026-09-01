import type { AssetClass, CashSubType } from './types'

/**
 * Die Klasse, unter der eine Position angezeigt wird - Anleihen werden dabei eigenständig geführt.
 *
 * Warum abgeleitet und nicht als eigene Anlageklasse in der Datenbank: Die Spalte asset_class hat
 * eine CHECK-Beschränkung auf die vier ursprünglichen Werte. Sie zu erweitern hieße, die
 * Positionstabelle neu aufzubauen - und an ihr hängt die Transaktionstabelle per Fremdschlüssel mit
 * Löschweitergabe. Ein solcher Eingriff in bestehende, echte Depotdaten wäre ein unnötiges Risiko.
 *
 * Stattdessen kennzeichnet sub_type='BOND' eine Anleihe. Der Wert ist im Schema längst erlaubt und
 * wurde bisher nur bei Cash-Positionen genutzt. So bleiben Anleihen-ETFs technisch Wertpapiere -
 * ihre Kurse werden weiter abgerufen wie bei jedem anderen ETF -, erscheinen aber überall als
 * eigener Bereich.
 */
export type DisplayClass = AssetClass | 'BOND'

export function displayClass(position: {
  assetClass: AssetClass
  subType: CashSubType | null
}): DisplayClass {
  return position.subType === 'BOND' ? 'BOND' : position.assetClass
}

/** Reihenfolge für Listen, Diagramme und die Seitenleiste. */
export const DISPLAY_CLASS_ORDER: DisplayClass[] = [
  'STOCK_ETF',
  'BOND',
  'CRYPTO',
  'COMMODITY',
  'CASH_OTHER'
]
