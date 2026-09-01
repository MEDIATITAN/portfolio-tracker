import * as positionsRepo from '../db/positionsRepo'
import * as transactionsRepo from '../db/transactionsRepo'
import type { Position } from '../../shared/types'

/**
 * Berechnet Bestand + Durchschnitts-Einstandspreis einer Position aus ihrem Transaktions-Ledger
 * per FIFO (first in, first out): Käufe bilden Lots, Verkäufe verbrauchen die ältesten Lots
 * zuerst. Übrig bleibt der tatsächlich noch gehaltene Bestand mit dem Einstandspreis genau dieser
 * verbleibenden Lots - nicht einfach der Durchschnitt aller Käufe, das würde bei Teilverkäufen den
 * Einstandspreis verfälschen. Schreibt das Ergebnis in positions.quantity/avg_cost_basis (Cache,
 * nicht bei jedem Lesezugriff neu berechnet - siehe csvImportService.ts, wo das nach jedem Import
 * aufgerufen wird).
 */
export function recomputePosition(positionId: number): void {
  const transactions = transactionsRepo.listTransactionsByPosition(positionId)
  if (transactions.length === 0) return

  const lots: { quantity: number; price: number }[] = []
  for (const t of transactions) {
    if (t.type === 'BUY') {
      lots.push({ quantity: t.quantity, price: t.price })
      continue
    }
    let remaining = t.quantity
    while (remaining > 1e-9 && lots.length > 0) {
      const lot = lots[0]
      const consumed = Math.min(lot.quantity, remaining)
      lot.quantity -= consumed
      remaining -= consumed
      if (lot.quantity <= 1e-9) lots.shift()
    }
  }

  const currentQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
  const totalCost = lots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0)
  const avgCostBasis = currentQuantity > 1e-9 ? totalCost / currentQuantity : null

  positionsRepo.updatePosition({ id: positionId, quantity: currentQuantity, avgCostBasis })
}

/**
 * Führt Positionen zusammen, die dasselbe Wertpapier meinen.
 *
 * Warum das nötig ist: Die Wertpapiersuche liefert je nach Anfrage einen anderen BÖRSENPLATZ
 * desselben Papiers - der iShares Core MSCI World kam aus einem Import als "IWDA.L" (London),
 * aus einem anderen als "IWDA.AS" (Amsterdam). Der Bestand lag danach auf zwei Positionen, obwohl
 * es dieselbe ISIN ist.
 *
 * Zusammengeführt wird ausschließlich über die ISIN - die ist je Wertpapier eindeutig. Über den
 * Namen zu gehen wäre gefährlich: "Novo Nordisk A/S" heißt bei Yahoo sowohl die dänische Aktie als
 * auch die US-Hinterlegungsaktie, die aber einen ganz anderen Kurs je Stück hat.
 *
 * Bestehen bleibt die Position mit den meisten Buchungen; deren Kürzel bestimmt künftig den
 * Kursabruf. Die Buchungen der anderen werden umgehängt, danach wird per FIFO neu gerechnet.
 */
export function mergeDuplicatesByIsin(): { merged: number; removed: string[] } {
  const positions = positionsRepo.listPositions()
  const byIsin = new Map<string, Position[]>()
  for (const p of positions) {
    if (!p.isin || p.assetClass !== 'STOCK_ETF') continue
    const list = byIsin.get(p.isin)
    if (list) list.push(p)
    else byIsin.set(p.isin, [p])
  }

  let merged = 0
  const removed: string[] = []
  for (const [, group] of byIsin) {
    if (group.length < 2) continue
    const sorted = [...group].sort(
      (a, b) =>
        transactionsRepo.countTransactionsForPosition(b.id) -
        transactionsRepo.countTransactionsForPosition(a.id)
    )
    const keep = sorted[0]
    for (const drop of sorted.slice(1)) {
      transactionsRepo.moveTransactions(drop.id, keep.id)
      positionsRepo.deletePosition(drop.id)
      removed.push(`${drop.identifier ?? drop.name} -> ${keep.identifier ?? keep.name}`)
      merged++
    }
    recomputePosition(keep.id)
  }
  return { merged, removed }
}

/**
 * Einmalig beim App-Start: Positionen, die schon vor Einführung des Transaktions-Ledgers manuell
 * angelegt wurden (Bestand + Einstandspreis direkt im Formular), bekommen eine einzelne
 * synthetische Eröffnungsbuchung, damit sie nahtlos ins Ledger-Modell übergehen, ohne dass
 * bestehende Daten verloren gehen. Nur für Positionen mit gesetztem avgCostBasis - sonst gäbe es
 * nichts Sinnvolles für den Buchungspreis zu erfinden, diese bleiben bis zur ersten echten
 * Transaktion im alten, manuell editierbaren Modus (siehe Position.hasTransactions).
 * Läuft bei jedem Start, ist aber danach ein no-op (Positionen mit hasTransactions werden übersprungen).
 */
export function migrateExistingPositionsToTransactions(): void {
  for (const position of positionsRepo.listPositions()) {
    if (position.assetClass === 'CASH_OTHER') continue
    if (position.hasTransactions) continue
    if (position.avgCostBasis === null || position.quantity <= 0) continue

    transactionsRepo.createTransaction({
      positionId: position.id,
      type: 'BUY',
      quantity: position.quantity,
      price: position.avgCostBasis,
      currency: position.currency,
      date: (position.purchaseDate ?? position.createdAt).slice(0, 10),
      broker: null,
      notes: 'Eröffnungsbestand (vor Einführung der Transaktionshistorie)'
    })
  }
}
