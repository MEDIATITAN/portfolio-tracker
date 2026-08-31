import type { AssetClass, FxRate, TransactionWithPosition } from '@shared/types'
import { findFxRate } from '@shared/valueCalc'

/** Ein abgeschlossener Verkauf mit dem daraus tatsächlich realisierten Ergebnis. */
export interface RealizedSale {
  transactionId: number
  positionId: number
  positionName: string
  assetClass: AssetClass
  date: string
  quantity: number
  /** Verkaufserlös in EUR. */
  proceedsEur: number
  /** Einstand der verkauften Stücke in EUR (nach FIFO zugeordnet). */
  costEur: number
  /** Erlös minus Einstand - der realisierte Gewinn (positiv) oder Verlust (negativ). */
  gainLossEur: number
  /** Rendite dieses Verkaufs bezogen auf seinen Einstand, oder null wenn der Einstand 0 war. */
  percent: number | null
}

/**
 * Ermittelt aus dem Transaktions-Ledger alle realisierten Ergebnisse per FIFO: jeder Verkauf
 * verbraucht die ältesten noch offenen Käufe, deren Einstand wird dem Verkaufserlös
 * gegenübergestellt. Anders als der unrealisierte Gewinn/Verlust (aktueller Bestand gegen
 * Einstandspreis) zählt hier nur, was durch tatsächliche Verkäufe feststeht.
 *
 * Umrechnung in EUR über den AKTUELLEN Wechselkurs, nicht den vom Verkaufstag - dieselbe
 * Vereinfachung wie im übrigen Ledger, in der Praxis ohne Auswirkung, da die importierten
 * Transaktionen ohnehin in EUR abgerechnet werden.
 */
export function computeRealizedSales(
  transactions: TransactionWithPosition[],
  fxRates: FxRate[]
): RealizedSale[] {
  const byPosition = new Map<number, TransactionWithPosition[]>()
  for (const t of transactions) {
    const arr = byPosition.get(t.positionId)
    if (arr) arr.push(t)
    else byPosition.set(t.positionId, [t])
  }

  const sales: RealizedSale[] = []

  for (const txs of byPosition.values()) {
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    const lots: { quantity: number; price: number }[] = []

    for (const t of sorted) {
      if (t.type === 'BUY') {
        lots.push({ quantity: t.quantity, price: t.price })
        continue
      }

      let remaining = t.quantity
      let costNative = 0
      while (remaining > 1e-9 && lots.length > 0) {
        const lot = lots[0]
        const consumed = Math.min(lot.quantity, remaining)
        costNative += consumed * lot.price
        lot.quantity -= consumed
        remaining -= consumed
        if (lot.quantity <= 1e-9) lots.shift()
      }

      const rate = findFxRate(fxRates, t.currency, 'EUR')
      if (rate === null) continue // ohne Kurs lieber weglassen als falsch umrechnen

      const proceedsEur = t.quantity * t.price * rate
      const costEur = costNative * rate
      sales.push({
        transactionId: t.id,
        positionId: t.positionId,
        positionName: t.positionName,
        assetClass: t.assetClass,
        date: t.date,
        quantity: t.quantity,
        proceedsEur,
        costEur,
        gainLossEur: proceedsEur - costEur,
        percent: costEur > 0 ? ((proceedsEur - costEur) / costEur) * 100 : null
      })
    }
  }

  return sales
}

export interface RealizedSummary {
  gainLossEur: number
  proceedsEur: number
  costEur: number
  /** Gesamtrendite über alle Verkäufe, bezogen auf den eingesetzten Einstand. */
  percent: number | null
  winners: number
  losers: number
}

export function summarizeRealized(sales: RealizedSale[]): RealizedSummary {
  let gainLossEur = 0
  let proceedsEur = 0
  let costEur = 0
  let winners = 0
  let losers = 0
  for (const s of sales) {
    gainLossEur += s.gainLossEur
    proceedsEur += s.proceedsEur
    costEur += s.costEur
    if (s.gainLossEur > 0) winners++
    else if (s.gainLossEur < 0) losers++
  }
  return {
    gainLossEur,
    proceedsEur,
    costEur,
    percent: costEur > 0 ? (gainLossEur / costEur) * 100 : null,
    winners,
    losers
  }
}
