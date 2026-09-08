/**
 * Einzelne Anleihen werden über ihre ISIN mit vorangestelltem "BOND:" als Identifier geführt.
 *
 * Warum ein Präfix und kein eigener Wert in asset_class oder security_type: beide Spalten haben
 * eine CHECK-Beschränkung, die sich nur durch einen Neuaufbau der Positionstabelle erweitern ließe -
 * und an ihr hängen die Transaktionen per Fremdschlüssel mit Löschweitergabe. Der Identifier ist
 * dagegen ein freies Textfeld. Am Präfix erkennt der Kursabruf, dass er zu onvista greifen muss
 * statt zu Yahoo, das einzelne Anleihen gar nicht führt.
 *
 * Anleihen liegen deshalb technisch als STOCK_ETF mit sub_type='BOND' in der Datenbank - genau wie
 * Anleihen-ETFs, die die App anhand ihrer Zusammensetzung selbst so einstuft. Angezeigt werden
 * beide über displayClass im eigenen Bereich "Anleihen".
 */

const BOND_PREFIX = 'BOND:'

export function bondIdentifier(isin: string): string {
  return `${BOND_PREFIX}${isin.trim().toUpperCase()}`
}

export function isBondIdentifier(identifier: string | null): boolean {
  return identifier !== null && identifier.startsWith(BOND_PREFIX)
}

/** Die ISIN aus einem Anleihen-Identifier, oder null, wenn es keiner ist. */
export function bondIsin(identifier: string | null): string | null {
  return isBondIdentifier(identifier) ? identifier!.slice(BOND_PREFIX.length) : null
}
