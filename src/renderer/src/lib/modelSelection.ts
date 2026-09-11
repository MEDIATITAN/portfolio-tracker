/**
 * Welche Modelle im Vergleich stehen.
 *
 * Bewusst im Browser-Speicher und nicht in der Datenbank: das ist Ansichtszustand wie der Zeitraum
 * oder das Universum, kein Depotinhalt. Die eigenen Modelle selbst liegen dagegen sehr wohl in der
 * Datenbank - die wären verloren, wenn der Speicher geleert wird.
 */

const STORAGE_KEY = 'analyse.modelSelection'

/** Die gespeicherte Auswahl, oder null wenn noch nie eine getroffen wurde (dann gilt: alle). */
export function loadModelSelection(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return null
  }
}

export function saveModelSelection(keys: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // Kein Speicher verfügbar (privater Modus, volles Kontingent): die Auswahl gilt dann nur für
    // diese Sitzung. Kein Grund, den Vergleich deshalb abzubrechen.
  }
}
