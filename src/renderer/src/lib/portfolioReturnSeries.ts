import type { Position, TransactionWithPosition } from '@shared/types'
import type { CashFlow, SeriesPoint } from '@shared/benchmarkCalc'
import { commodityPricingUnit } from '@shared/commodities'
import { convertQuantity } from '@shared/valueCalc'

const DAY_MS = 24 * 60 * 60 * 1000

function toDayKey(value: Date | number | string): string {
  return new Date(value).toISOString().slice(0, 10)
}

export interface PortfolioSeriesInput {
  positions: Position[]
  transactions: TransactionWithPosition[]
  /** Was eine Einheit dieses Wertpapiers an diesem Tag in Euro wert war (buildPriceEurLookup). */
  priceEur: (identifier: string, day: string) => number | null
  fromDay: string
  toDay: string
}

export interface PortfolioSeriesResult {
  /** Wertentwicklung ab 100 am ersten Tag, um Ein- und Auszahlungen bereinigt. */
  index: SeriesPoint[]
  /** Depotwert in Euro je Tag - Grundlage für den Euro-Vergleich. */
  value: SeriesPoint[]
  /** Ein- und Auszahlungen je Tag, in Euro. */
  flows: CashFlow[]
  /** Gehaltene Positionen ohne Kurs, mit der Zahl der betroffenen Tage. Ein einzelner fehlender
   *  Tag (Kauf am Tag vor dem ersten Kurs) ist belanglos, ein halbes Jahr dagegen nicht - deshalb
   *  die Anzahl statt nur der Namen. */
  withoutPrices: { name: string; days: number }[]
}

/**
 * Stückzahl einer Position an einem Stichtag, rückwärts aus den heutigen Beständen gerechnet.
 *
 * Rückwärts und nicht vorwärts, weil `positions.quantity` der maßgebliche Wert ist: er wird nach
 * jedem Import per FIFO neu bestimmt. Würde man vorwärts aus den Transaktionen summieren, ergäbe
 * eine unvollständig importierte Historie am Ende einen anderen Bestand als den tatsächlichen -
 * die letzte Zahl der Reihe stimmte dann nicht mit dem Depot überein, das nebenan angezeigt wird.
 *
 * Nicht abgeschnitten wird bei negativen Zwischenständen: wer heute 0 Stück hält und in der
 * Historie nur einen Verkauf über 8 Stück hat (kommt bei Teil-Importen vor), hielt vorher
 * tatsächlich 8 Stück. Genau das ist hier gewollt. Erst ein negativer Bestand wäre unsinnig - der
 * wird auf 0 gesetzt.
 */
function buildQuantityLookup(
  positions: Position[],
  transactions: TransactionWithPosition[]
): (position: Position, day: string) => number {
  const byPosition = new Map<number, { date: string; delta: number }[]>()
  for (const t of transactions) {
    const delta = t.type === 'BUY' ? t.quantity : -t.quantity
    const list = byPosition.get(t.positionId)
    if (list) list.push({ date: t.date.slice(0, 10), delta })
    else byPosition.set(t.positionId, [{ date: t.date.slice(0, 10), delta }])
  }
  for (const list of byPosition.values()) list.sort((a, b) => a.date.localeCompare(b.date))

  // Erster Tag, an dem die Position überhaupt existiert - davor ist der Bestand 0, egal was die
  // Rückwärtsrechnung ergibt. Ohne das hielte ein Depot rückwirkend bis in alle Ewigkeit
  // dieselben Papiere.
  const heldSince = new Map<number, string>()
  for (const p of positions) {
    const first = byPosition.get(p.id)?.[0]?.date
    const own = toDayKey(p.purchaseDate ?? p.createdAt)
    heldSince.set(p.id, first !== undefined && first < own ? first : own)
  }

  return (position, day) => {
    if (day < (heldSince.get(position.id) ?? '')) return 0
    let quantity = position.quantity
    const list = byPosition.get(position.id)
    if (list) {
      for (let i = list.length - 1; i >= 0 && list[i].date > day; i--) quantity -= list[i].delta
    }
    return quantity > 0 ? quantity : 0
  }
}

/**
 * Zeitgewichtete Wertentwicklung des eigenen Depots.
 *
 * Der Kern ist die Trennung von Kursbewegung und Zahlungsstrom. Der Depotwert steigt aus zwei
 * ganz verschiedenen Gründen: weil die Kurse steigen, oder weil Geld nachgelegt wurde. Nur das
 * erste ist Rendite. Deshalb gilt für jeden Tag
 *
 *   Zahlungsstrom(d) = Σ (Stück(d) - Stück(d-1)) · Kurs(d)
 *   Rendite(d)       = (Wert(d) - Zahlungsstrom(d)) / Wert(d-1) - 1
 *
 * Als Zahlungsstrom zählt also jede Bestandsänderung, die keine Kursbewegung ist. Das erfasst
 * Käufe, Verkäufe und Sparplanbuchungen von selbst - und ebenso den Fall, dass eine Position
 * erstmals einen Kurs bekommt (etwa eine Wallet-Position ohne Kaufhistorie). Sie taucht dann als
 * Einzahlung auf statt als Gewinn aus dem Nichts.
 */
export function buildPortfolioSeries({
  positions,
  transactions,
  priceEur,
  fromDay,
  toDay
}: PortfolioSeriesInput): PortfolioSeriesResult {
  // Guthaben und Sonstiges bleiben außen vor: sie haben keinen Kursverlauf, sondern nur einen von
  // Hand gepflegten Wert. Genau wie im Verlaufsdiagramm des Dashboards.
  const relevant = positions.filter((p) => p.assetClass !== 'CASH_OTHER' && p.identifier)
  if (relevant.length === 0) {
    return { index: [], value: [], flows: [], withoutPrices: [] }
  }

  const quantityAt = buildQuantityLookup(relevant, transactions)

  // Rohstoffe werden je Feinunze/Pfund notiert, im Depot aber oft in Gramm geführt.
  const pricingQuantity = (position: Position, quantity: number): number => {
    if (position.assetClass !== 'COMMODITY' || !position.identifier) return quantity
    const unit = commodityPricingUnit(position.identifier)
    if (!unit || !position.quantityUnit) return quantity
    return convertQuantity(quantity, position.quantityUnit, unit)
  }

  const startMs = Date.parse(`${fromDay}T00:00:00.000Z`)
  const endMs = Date.parse(`${toDay}T00:00:00.000Z`)

  const value: SeriesPoint[] = []
  const flows: CashFlow[] = []
  const index: SeriesPoint[] = []
  const unpricedDays = new Map<string, number>()

  let previousValue: number | null = null
  const previousQuantity = new Map<number, number>()
  let indexValue = 100

  for (let cursor = startMs; cursor <= endMs; cursor += DAY_MS) {
    const day = toDayKey(cursor)
    let total = 0
    let flow = 0
    let priced = false

    for (const position of relevant) {
      const identifier = position.identifier as string
      const quantity = quantityAt(position, day)
      const previous = previousQuantity.get(position.id) ?? 0
      const price = priceEur(identifier, day)

      if (price === null) {
        if (quantity > 0)
          unpricedDays.set(position.name, (unpricedDays.get(position.name) ?? 0) + 1)
        // Ohne Kurs kann die Position weder bewertet noch als Zufluss verbucht werden. Der
        // gemerkte Bestand bleibt deshalb auf 0, damit sie am ersten Tag MIT Kurs vollständig
        // als Einzahlung erscheint - und nicht als Kurssprung aus dem Nichts.
        previousQuantity.set(position.id, 0)
        continue
      }

      priced = true
      total += pricingQuantity(position, quantity) * price
      flow += (pricingQuantity(position, quantity) - pricingQuantity(position, previous)) * price
      previousQuantity.set(position.id, quantity)
    }

    if (!priced) continue

    if (previousValue !== null && previousValue > 0) {
      indexValue *= (total - flow) / previousValue
      index.push({ date: day, value: indexValue })
    } else if (total > 0) {
      // Erster Tag mit Bestand: hier beginnt die Reihe bei 100.
      index.push({ date: day, value: indexValue })
    }

    if (total > 0 || previousValue !== null) value.push({ date: day, value: total })
    if (Math.abs(flow) > 0.005) flows.push({ date: day, amount: flow })
    previousValue = total
  }

  return {
    index,
    value,
    flows,
    withoutPrices: [...unpricedDays.entries()]
      .map(([name, days]) => ({ name, days }))
      .sort((a, b) => b.days - a.days)
  }
}
