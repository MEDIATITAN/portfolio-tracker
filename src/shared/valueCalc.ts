import type { FxRate, PriceCacheEntry, Position, QuantityUnit } from './types'
import { displayClass, type DisplayClass } from './displayClass'
import { commodityPricingUnit } from './commodities'

const GRAMS_PER_TROY_OUNCE = 31.1034768
const GRAMS_PER_POUND = 453.59237

function toGrams(quantity: number, unit: QuantityUnit): number {
  switch (unit) {
    case 'GRAM':
      return quantity
    case 'KG':
      return quantity * 1000
    case 'TROY_OUNCE':
      return quantity * GRAMS_PER_TROY_OUNCE
    case 'POUND':
      return quantity * GRAMS_PER_POUND
  }
}

/** Rechnet zwischen Gewichtseinheiten um (z.B. Gramm -> Feinunze für Gold, Kilogramm -> Pfund für Kupfer). */
export function convertQuantity(
  quantity: number,
  fromUnit: QuantityUnit,
  toUnit: QuantityUnit
): number {
  if (fromUnit === toUnit) return quantity
  const grams = toGrams(quantity, fromUnit)
  switch (toUnit) {
    case 'GRAM':
      return grams
    case 'KG':
      return grams / 1000
    case 'TROY_OUNCE':
      return grams / GRAMS_PER_TROY_OUNCE
    case 'POUND':
      return grams / GRAMS_PER_POUND
  }
}

/** Sucht einen Wechselkurs from->to, auch invertiert falls nur die Gegenrichtung gecacht ist. */
export function findFxRate(fxRates: FxRate[], from: string, to: string): number | null {
  if (from === to) return 1
  const direct = fxRates.find((r) => r.base === from && r.quote === to)
  if (direct) return direct.rate
  const inverse = fxRates.find((r) => r.base === to && r.quote === from)
  if (inverse && inverse.rate !== 0) return 1 / inverse.rate
  return null
}

export interface PositionValue {
  position: Position
  /** Aktueller Gesamtwert in EUR, oder null wenn (noch) kein Kurs/Wechselkurs verfügbar ist. */
  valueEur: number | null
  /** Aktueller Gesamtwert in der Marktwährung, oder null wenn (noch) kein Kurs verfügbar ist. */
  valueNative: number | null
  /** Aktueller Kurs pro Einheit in EUR (Marktkurs, umgerechnet). */
  priceEur: number | null
  /** Einstandspreis pro Einheit in EUR (umgerechnet aus der Positionswährung, die der Nutzer selbst wählt). */
  avgCostBasisEur: number | null
  /** Gewinn/Verlust in EUR ggü. avgCostBasis, oder null wenn kein Einstandspreis gesetzt / kein Kurs verfügbar. */
  gainLossEur: number | null
  stale: boolean
  fetchError: string | null
}

export function computePositionValue(
  position: Position,
  priceCache: PriceCacheEntry[],
  fxRates: FxRate[]
): PositionValue {
  if (position.assetClass === 'CASH_OTHER') {
    const valueNative = position.manualValue ?? 0
    const rate = findFxRate(fxRates, position.currency, 'EUR')
    return {
      position,
      valueNative,
      valueEur: rate !== null ? valueNative * rate : null,
      priceEur: null,
      avgCostBasisEur: null,
      gainLossEur: null,
      stale: false,
      fetchError: null
    }
  }

  const cacheEntry = position.identifier
    ? priceCache.find((p) => p.identifier === position.identifier)
    : undefined

  if (!cacheEntry) {
    return {
      position,
      valueEur: null,
      valueNative: null,
      priceEur: null,
      avgCostBasisEur: null,
      gainLossEur: null,
      stale: false,
      fetchError: null
    }
  }

  // Der Kurs von Yahoo ist immer in der jeweiligen Notierungseinheit des Futures (Gold/Silber in
  // Feinunze, Kupfer in Pfund) - bei Positionen, die in Gramm/kg erfasst wurden, muss die Menge
  // für die Wertberechnung erst umgerechnet werden.
  const pricingUnit =
    position.assetClass === 'COMMODITY' ? commodityPricingUnit(position.identifier) : null
  const pricingQuantity =
    pricingUnit && position.quantityUnit
      ? convertQuantity(position.quantity, position.quantityUnit, pricingUnit)
      : position.quantity

  const valueNative = pricingQuantity * cacheEntry.price
  // Der Marktkurs braucht IMMER den Wechselkurs der Marktwährung (z.B. USD bei US-Aktien).
  const priceRate = findFxRate(fxRates, cacheEntry.currency, 'EUR')
  const valueEur = priceRate !== null ? valueNative * priceRate : null
  const priceEur = priceRate !== null ? cacheEntry.price * priceRate : null

  // avgCostBasis wurde vom Nutzer in `position.currency` eingegeben (z.B. EUR, auch wenn die
  // Aktie selbst in USD notiert) - braucht deshalb einen EIGENEN Wechselkurs, nicht den der
  // Marktwährung. Das war vorher ein Bug: ein in EUR eingegebener Kaufpreis wurde fälschlich
  // mit dem USD-Kurs umgerechnet.
  const costRate = findFxRate(fxRates, position.currency, 'EUR')
  const avgCostBasisEur =
    position.avgCostBasis !== null && costRate !== null ? position.avgCostBasis * costRate : null

  let gainLossEur: number | null = null
  if (valueEur !== null && avgCostBasisEur !== null) {
    gainLossEur = valueEur - position.quantity * avgCostBasisEur
  }

  return {
    position,
    valueNative,
    valueEur,
    priceEur,
    avgCostBasisEur,
    gainLossEur,
    stale: Boolean(cacheEntry.fetchError),
    fetchError: cacheEntry.fetchError
  }
}

export function computeAllPositionValues(
  positions: Position[],
  priceCache: PriceCacheEntry[],
  fxRates: FxRate[]
): PositionValue[] {
  return positions.map((p) => computePositionValue(p, priceCache, fxRates))
}

export function sumByAssetClass(values: PositionValue[]): Record<DisplayClass, number> {
  // Nach ANZEIGEKLASSE aufteilen, damit Anleihen auch im gespeicherten Verlauf eigenständig
  // erscheinen - sonst zeigte der Zeitverlauf beim Filter 'Anleihen' dauerhaft null.
  const totals: Record<DisplayClass, number> = {
    STOCK_ETF: 0,
    BOND: 0,
    CRYPTO: 0,
    COMMODITY: 0,
    CASH_OTHER: 0
  }
  for (const v of values) {
    if (v.valueEur !== null) totals[displayClass(v.position)] += v.valueEur
  }
  return totals
}

export function sumTotalEur(values: PositionValue[]): number {
  return values.reduce((sum, v) => sum + (v.valueEur ?? 0), 0)
}

export interface TotalGainLoss {
  gainLossEur: number
  /** Summe der Einstandswerte (nur Positionen mit gesetztem Einstandspreis) - Basis der %-Berechnung. */
  costBasisEur: number
  /** null wenn keine Position einen Einstandspreis hat und die Rendite deshalb nicht berechenbar ist. */
  percent: number | null
}

/** Gesamtrendite über alle Positionen mit gesetztem Einstandspreis (Positionen ohne werden ausgelassen). */
export function totalGainLoss(values: PositionValue[]): TotalGainLoss {
  let gainLossEur = 0
  let costBasisEur = 0
  for (const v of values) {
    if (v.avgCostBasisEur === null || v.gainLossEur === null) continue
    gainLossEur += v.gainLossEur
    costBasisEur += v.position.quantity * v.avgCostBasisEur
  }
  const percent = costBasisEur > 0 ? (gainLossEur / costBasisEur) * 100 : null
  return { gainLossEur, costBasisEur, percent }
}
