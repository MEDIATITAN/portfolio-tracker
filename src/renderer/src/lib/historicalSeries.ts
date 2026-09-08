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
 * Nachschlagewerk für "was war eine Einheit dieses Wertpapiers an Tag X in Euro wert".
 *
 * Aus derselben Datenbasis wie die Wertreihe unten gebaut - beide müssen zwingend denselben
 * Kurs für denselben Tag liefern, sonst widerspricht die Gewinner/Verlierer-Liste dem
 * Diagramm daneben.
 */
export function buildPriceEurLookup(
  historicalPrices: HistoricalPriceEntry[],
  historicalFxRates: HistoricalFxEntry[]
): (identifier: string, day: string) => number | null {
  const pricesByIdentifier = groupPricesByIdentifier(historicalPrices)
  const rateToEur = buildHistoricalRateLookup(historicalFxRates)
  return (identifier, day) => {
    const series = pricesByIdentifier.get(identifier)
    const point = series ? lastOnOrBefore(series, day) : null
    if (!point) return null
    const rate = rateToEur(point.currency, day)
    return rate === null ? null : point.price * rate
  }
}

function groupPricesByIdentifier(
  historicalPrices: HistoricalPriceEntry[]
): Map<string, HistoricalPriceEntry[]> {
  const byIdentifier = new Map<string, HistoricalPriceEntry[]>()
  for (const p of historicalPrices) {
    const arr = byIdentifier.get(p.identifier)
    if (arr) arr.push(p)
    else byIdentifier.set(p.identifier, [p])
  }
  for (const arr of byIdentifier.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
  return byIdentifier
}

/**
 * historical_fx_rates speichert base=EUR/quote=<Fremdwährung> (z.B. "1 EUR = 1.1652 USD") -
 * um einen Preis IN der Fremdwährung nach EUR umzurechnen, muss man DURCH den Kurs teilen,
 * nicht damit multiplizieren (genau wie findFxRate() es für die Live-Kurse macht). War ein
 * echter Bug: Positionen in Fremdwährung wurden dadurch überbewertet, und zwar umso mehr, je
 * weiter der Kurs von 1 entfernt ist (bei DKK/HKD mit Kursen um 7-9 entsprechend drastisch).
 */
function buildHistoricalRateLookup(
  historicalFxRates: HistoricalFxEntry[]
): (quote: string, day: string) => number | null {
  const fxByQuote = new Map<string, HistoricalFxEntry[]>()
  for (const f of historicalFxRates) {
    if (f.base !== 'EUR') continue
    const arr = fxByQuote.get(f.quote)
    if (arr) arr.push(f)
    else fxByQuote.set(f.quote, [f])
  }
  for (const arr of fxByQuote.values()) arr.sort((a, b) => a.date.localeCompare(b.date))

  return (quote, day) => {
    if (quote === 'EUR') return 1
    const series = fxByQuote.get(quote)
    const point = series ? lastOnOrBefore(series, day) : null
    if (!point || point.rate === 0) return null
    return 1 / point.rate
  }
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

  const pricesByIdentifier = groupPricesByIdentifier(historicalPrices)
  const historicalRateToEur = buildHistoricalRateLookup(historicalFxRates)

  const starts = relevant.map((p) => ({
    position: p,
    startDay: toDayKey(p.purchaseDate ?? p.createdAt)
  }))
  const earliestDay = starts.reduce(
    (min, s) => (s.startDay < min ? s.startDay : min),
    starts[0].startDay
  )
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

      const pricingUnit =
        position.assetClass === 'COMMODITY' ? commodityPricingUnit(position.identifier) : null
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
