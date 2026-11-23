import { getDb } from '../db'
import { mergeDuplicatePositions, migrateExistingPositionsToTransactions } from './ledgerService'
import { backfillOpeningBalances } from './cashBalanceService'

/**
 * Öffnet die Datenbank des aktiven Profils und bringt sie auf den Stand der App. Läuft beim Start
 * und nach jedem Profilwechsel - jede Datenbank durchläuft dieselben Nachbesserungen, auch eine,
 * die seit Monaten nicht offen war.
 */
export function prepareDatabase(): void {
  // DB-Schema initialisieren, bevor IPC-Handler darauf zugreifen.
  getDb()
  migrateExistingPositionsToTransactions()
  // Derselbe Vermögenswert kann doppelt liegen: ein Wertpapier aus zwei Broker-Importen unter
  // verschiedenen Börsenplätzen ('IWDA.L' gegen 'IWDA.AS'), oder ein Rohstoff, der zweimal von Hand
  // angelegt wurde. Einmal zusammenführen - idempotent, ohne Doppelungen ein no-op.
  // Läuft NACH der Ledger-Migration, damit auch frisch erzeugte Eröffnungsbuchungen erfasst sind.
  const dedupe = mergeDuplicatePositions()
  if (dedupe.merged > 0)
    console.log(
      `${dedupe.merged} doppelte Position(en) zusammengeführt:`,
      dedupe.removed.join(', ')
    )
  // Guthaben, die es vor dem Kontostands-Verlauf schon gab, bekommen ihren aktuellen Stand als
  // ersten Eintrag - ohne den begänne ihr Diagramm erst mit der nächsten Änderung.
  const added = backfillOpeningBalances()
  if (added > 0)
    console.log(`Kontostands-Verlauf: Anfangsstand für ${added} Konto/Konten nachgetragen`)
}
