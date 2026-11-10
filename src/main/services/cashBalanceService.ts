import * as cashBalanceRepo from '../db/cashBalanceRepo'
import * as positionsRepo from '../db/positionsRepo'
import type { CashBalanceSource, Position } from '../../shared/types'

/**
 * Schreibt einen Eintrag in den Kontostands-Verlauf, wenn sich an einem Guthaben etwas geändert
 * hat, das den Stand betrifft: der Betrag oder seine Währung.
 *
 * `before` ist der Stand vor der Änderung oder null bei einer neu angelegten Position. Alles
 * andere am Konto (Name, Kontoart, Notiz) darf sich ändern, ohne eine Zeile zu hinterlassen - der
 * Verlauf soll Bewegungen des Geldes zeigen, nicht jede Umbenennung.
 *
 * Wird eine bestehende Position erst durch die Änderung zu einem Guthaben, zählt das als
 * Eröffnung: ihr bisheriger Verlauf, falls sie vorher ein Wertpapier war, steckt im Ledger.
 */
export function recordBalanceChange(
  before: Position | null,
  after: Position,
  source: CashBalanceSource,
  note: string | null = null
): void {
  if (after.assetClass !== 'CASH_OTHER') return
  const balance = after.manualValue ?? 0
  const wasCash = before !== null && before.assetClass === 'CASH_OTHER'
  if (wasCash && (before.manualValue ?? 0) === balance && before.currency === after.currency) return

  cashBalanceRepo.recordBalance({
    positionId: after.id,
    balance,
    currency: after.currency,
    source: wasCash ? source : 'OPENING',
    note: wasCash ? note : null
  })
}

/**
 * Einmalig beim App-Start: Guthaben, die es schon gab, bevor der Verlauf mitgeschrieben wurde,
 * bekommen ihren aktuellen Stand als ersten Eintrag - sonst begänne ihr Diagramm erst mit der
 * nächsten Änderung und bliebe bis dahin leer.
 *
 * Als Zeitpunkt dient updated_at, nicht created_at: der Stand ist seit der letzten Änderung der
 * Position so, davor kann er anders gewesen sein - der Verlauf behauptet nichts, was niemand
 * gemessen hat. Läuft bei jedem Start, ist aber ein no-op, sobald jedes Konto einen Eintrag hat.
 */
export function backfillOpeningBalances(): number {
  const known = cashBalanceRepo.positionIdsWithHistory()
  let added = 0
  for (const position of positionsRepo.listPositions()) {
    if (position.assetClass !== 'CASH_OTHER' || known.has(position.id)) continue
    cashBalanceRepo.recordBalance({
      positionId: position.id,
      balance: position.manualValue ?? 0,
      currency: position.currency,
      source: 'OPENING',
      note: null,
      recordedAt: position.updatedAt
    })
    added++
  }
  return added
}
