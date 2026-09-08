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
 * Löscht eine einzelne Buchung und rechnet die Position danach neu.
 *
 * War es die LETZTE Buchung, bleiben Bestand und Einstandspreis stehen, wie sie zuletzt
 * berechnet wurden: die Position fällt damit in den manuellen Modus zurück (siehe
 * Position.hasTransactions) und ist wieder von Hand editierbar. Sie auf null zu setzen wäre
 * die schlechtere Wahl - man löscht eine fehlerhafte Buchung, um sie zu ersetzen, nicht um
 * den Bestand zu verlieren.
 */
export function deleteTransaction(id: number): void {
  const positionId = transactionsRepo.deleteTransaction(id)
  if (positionId === null) return
  recomputePosition(positionId)
}

/**
 * Schlüssel, unter dem zwei Positionen als derselbe Vermögenswert gelten - oder null, wenn sich das
 * nicht sicher entscheiden lässt und deshalb nichts zusammengeführt wird.
 *
 * Wertpapiere: ausschließlich die ISIN, die ist je Papier eindeutig. Über den Namen zu gehen wäre
 * gefährlich - "Novo Nordisk A/S" heißt bei Yahoo sowohl die dänische Aktie als auch die
 * US-Hinterlegungsaktie, die einen ganz anderen Kurs je Stück hat.
 *
 * Rohstoffe haben keine ISIN; dort ist der Schlüssel das Kürzel PLUS die Mengeneinheit. 2,5 Gramm
 * und 1 Feinunze Gold sind zwar dasselbe Metall, ihre Buchungen dürfen aber nicht in einen Topf:
 * Menge und Preis je Einheit würden sonst nicht mehr zusammenpassen. Ein physisch hinterlegter
 * Gold-ETC hat ein eigenes Kürzel und bleibt dadurch ohnehin getrennt - er ist ein Wertpapier mit
 * eigenem Kurs, kein Barren.
 */
function mergeKey(p: Position): string | null {
  if (p.assetClass === 'STOCK_ETF') return p.isin ? `isin:${p.isin}` : null
  if (p.assetClass === 'COMMODITY')
    return p.identifier ? `commodity:${p.identifier}:${p.quantityUnit ?? ''}` : null
  return null
}

/**
 * Führt Positionen zusammen, die denselben Vermögenswert meinen.
 *
 * Warum das nötig ist: Die Wertpapiersuche liefert je nach Anfrage einen anderen BÖRSENPLATZ
 * desselben Papiers - der iShares Core MSCI World kam aus einem Import als "IWDA.L" (London),
 * aus einem anderen als "IWDA.AS" (Amsterdam). Der Bestand lag danach auf zwei Positionen, obwohl
 * es dieselbe ISIN ist. Bei Rohstoffen entsteht dasselbe, wenn derselbe Bestand zweimal von Hand
 * angelegt wird.
 *
 * Positionen OHNE Buchungen werden bewusst übersprungen: ihr Bestand steht nur in der Position
 * selbst, etwa bei einem Geschenk ohne Kaufpreis. Nach dem Zusammenführen wird der Bestand aus dem
 * Ledger neu berechnet - eine buchungslose Position würde dabei ersatzlos verschwinden.
 *
 * Bestehen bleibt die Position mit den meisten Buchungen; deren Kürzel bestimmt künftig den
 * Kursabruf. Die Buchungen der anderen werden umgehängt, danach wird per FIFO neu gerechnet.
 */
export function mergeDuplicatePositions(): { merged: number; removed: string[] } {
  const groups = new Map<string, Position[]>()
  for (const p of positionsRepo.listPositions()) {
    if (!p.hasTransactions) continue
    const key = mergeKey(p)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }

  let merged = 0
  const removed: string[] = []
  for (const [, group] of groups) {
    if (group.length < 2) continue
    const sorted = [...group].sort(
      (a, b) =>
        transactionsRepo.countTransactionsForPosition(b.id) -
        transactionsRepo.countTransactionsForPosition(a.id)
    )
    const keep = sorted[0]
    const notes = keep.notes ? [keep.notes] : []
    for (const drop of sorted.slice(1)) {
      transactionsRepo.moveTransactions(drop.id, keep.id)
      // Notiz mitnehmen, bevor die Position gelöscht wird - sonst ginge der Vermerk verloren,
      // woher ein Bestand stammt.
      if (drop.notes && !notes.includes(drop.notes)) notes.push(drop.notes)
      positionsRepo.deletePosition(drop.id)
      removed.push(`${drop.identifier ?? drop.name} -> ${keep.identifier ?? keep.name}`)
      merged++
    }
    if (notes.length > (keep.notes ? 1 : 0)) {
      positionsRepo.updatePosition({ id: keep.id, notes: notes.join(' / ') })
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
