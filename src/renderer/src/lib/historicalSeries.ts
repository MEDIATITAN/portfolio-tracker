import type { FxRate, HistoricalFxEntry, HistoricalPriceEntry, Position } from '@shared/types'
import { commodityPricingUnit } from '@shared/commodities'
import { convertQuantity, findFxRate } from '@shared/valueCalc'

export interface DailyPoint {
  timestamp: number
  value: number
  /** true, wenn mindestens eine Position an diesem Tag nur über den Einstandspreis geschätzt
   *  werden konnte (keine echten historischen Kurse verfügbar - v.a. CoinGecko-365-Tage-Limit
   *  oder API-Fehler beim Abruf). */
  isEstimate: boolean
}

function toDayKey(value: Date | number | string): string {
  return new Date(value).toISOString().slice(0, 10)
}

/** Letzter Eintrag mit date <= day (die Reihe muss aufsteigend sortiert sein). */
function lastOnOrBefore<T extends { date: string }>(sorted: T[], day: string): T | null {
  let result: T | null = null
  for (const item of sorted) {
    if (item.date <= day) result = item
    else break
  }
  return result
}

/**
 * Baut eine tägliche Wertreihe VOR dem ersten echten Snapshot, basierend primär auf echten
 * historischen Kursen (Yahoo/CoinGecko/Frankfurter) und - wo für einen Tag/eine Position keine
 * vorhanden sind - auf einer Einstandspreis-Schätzung als Fallback (z.B. weil eine Krypto-
 * Position älter als CoinGeckos kostenloses 365-Tage-Limit ist, oder ein API-Abruf fehlschlug).
 */
export function buildDailyHistoricalSeries(
  positions: Position[],
  historicalPrices: HistoricalPriceEntry[],
  historicalFxRates: HistoricalFxEntry[],
  liveFxRates: FxRate[],
  endDateExclusive: string | null
): DailyPoint[] {
  const relevant = positions.filter((p) => p.assetClass !== 'CASH_OTHER' && p.identifier)
  if (relevant.length === 0) return []

  const pricesByIdentifier = new Map<string, HistoricalPriceEntry[]>()
  for (const p of historicalPrices) {
    const arr = pricesByIdentifier.get(p.identifier)
    if (arr) arr.push(p)
    else pricesByIdentifier.set(p.identifier, [p])
  }
  for (const arr of pricesByIdentifier.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

  const fxByQuote = new Map<string, HistoricalFxEntry[]>()
  for (const f of historicalFxRates) {
    if (f.base !== 'EUR') continue
    const arr = fxByQuote.get(f.quote)
    if (arr) arr.push(f)
    else fxByQuote.set(f.quote, [f])
  }
  for (const arr of fxByQuote.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

  function historicalRateToEur(quote: string, day: string): number | null {
    if (quote === 'EUR') return 1
    const series = fxByQuote.get(quote)
    const point = series ? lastOnOrBefore(series, day) : null
    return point?.rate ?? null
  }

  const starts = relevant.map((p) => ({ position: p, startDay: toDayKey(p.purchaseDate ?? p.createdAt) }))
  const earliestDay = starts.reduce((min, s) => (s.startDay < min ? s.startDay : min), starts[0].startDay)
  const endDay = endDateExclusive ?? toDayKey(new Date())
  if (earliestDay >= endDay) return []

  const DAY_MS = 24 * 60 * 60 * 1000
  const startMs = new Date(`${earliestDay}T00:00:00.000Z`).getTime()
  const endMs = new Date(`${endDay}T00:00:00.000Z`).getTime()

  const points: DailyPoint[] = []
  for (let cursor = startMs; cursor < endMs; cursor += DAY_MS) {
    const day = toDayKey(cursor)
    let total = 0
    let hasContribution = false
    let isEstimate = false

    for (const { position, startDay } of starts) {
      if (startDay > day || !position.identifier) continue

      const pricingUnit = position.assetClass === 'COMMODITY' ? commodityPricingUnit(position.identifier) : null
      const pricingQuantity =
        pricingUnit && position.quantityUnit
          ? convertQuantity(position.quantity, position.quantityUnit, pricingUnit)
          : position.quantity

      const priceSeries = pricesByIdentifier.get(position.identifier)
      const histPoint = priceSeries ? lastOnOrBefore(priceSeries, day) : null
      const histRate = histPoint ? historicalRateToEur(histPoint.currency, day) : null

      if (histPoint && histRate !== null) {
        total += pricingQuantity * histPoint.price * histRate
        hasContribution = true
        continue
      }

      // Fallback: Einstandspreis-Schätzung (wie im "nur Kaufdatum, keine echten Kurse"-Modus),
      // mit dem aktuellen (nicht historischen) Wechselkurs - selbst schon eine Näherung.
      if (position.avgCostBasis !== null) {
        const fallbackRate = findFxRate(liveFxRates, position.currency, 'EUR')
        if (fallbackRate !== null) {
          total += position.quantity * position.avgCostBasis * fallbackRate
          hasContribution = true
          isEstimate = true
        }
      }
    }

    if (hasContribution) points.push({ timestamp: cursor, value: total, isEstimate })
  }

  return points
}
