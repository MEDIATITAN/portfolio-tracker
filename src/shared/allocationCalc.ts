/**
 * Zusammensetzung: das eigene Depot und ein Modellportfolio auf denselben Nenner gebracht.
 *
 * Die Modelle sind über sechs Bausteine definiert (siehe benchmarkCalc.ts), das eigene Depot über
 * Anlageklassen. Damit sich beides vergleichen lässt, werden beide Seiten auf dieselben groben
 * Töpfe abgebildet - die drei Anleihenbausteine fallen dabei zu EINEM Topf zusammen, weil sich ein
 * eigenes Depot nicht nach Restlaufzeit aufteilen lässt: diese Angabe steht bei den Positionen
 * schlicht nirgends.
 *
 * Bewusst ohne React- und Datenbankbezug, damit sich die Zahlen einzeln nachrechnen lassen.
 */

import type { BenchmarkComponent, BenchmarkWeights } from './benchmarkCalc'
import { BENCHMARK_COMPONENTS } from './benchmarkCalc'
import { displayClass } from './displayClass'
import type { PositionValue } from './valueCalc'
import type { AssetClass, CashSubType, SecurityType } from './types'

export type AllocationBucket = 'EQUITY' | 'BOND' | 'GOLD' | 'COMMODITY' | 'CRYPTO' | 'CASH'

export const ALLOCATION_BUCKET_ORDER: AllocationBucket[] = [
  'EQUITY',
  'BOND',
  'GOLD',
  'COMMODITY',
  'CRYPTO',
  'CASH'
]

export const ALLOCATION_BUCKET_LABELS: Record<AllocationBucket, string> = {
  EQUITY: 'Aktien & ETFs',
  BOND: 'Anleihen',
  GOLD: 'Gold',
  COMMODITY: 'Rohstoffe',
  CRYPTO: 'Kryptowährungen',
  CASH: 'Cash & Sonstiges'
}

/** Welchem Topf ein Modellbaustein zufällt. */
export function componentBucket(component: BenchmarkComponent): AllocationBucket {
  switch (component) {
    case 'EQUITY':
    case 'EQUITY_WORLD':
      return 'EQUITY'
    case 'BOND_AGG':
    case 'BOND_LONG':
    case 'BOND_MID':
      return 'BOND'
    case 'GOLD':
      return 'GOLD'
    case 'COMMODITY':
      return 'COMMODITY'
    case 'CRYPTO':
      return 'CRYPTO'
  }
}

function emptyBuckets(): Record<AllocationBucket, number> {
  return { EQUITY: 0, BOND: 0, GOLD: 0, COMMODITY: 0, CRYPTO: 0, CASH: 0 }
}

/** Die Sollgewichte eines Modells, zu Töpfen zusammengefasst. Anteile von 1. */
export function modelBuckets(weights: BenchmarkWeights): Record<AllocationBucket, number> {
  const out = emptyBuckets()
  for (const component of BENCHMARK_COMPONENTS) {
    const weight = weights[component] ?? 0
    if (weight > 0) out[componentBucket(component)] += weight
  }
  return out
}

/**
 * Gold von den übrigen Rohstoffen trennen.
 *
 * Nötig, weil die Modelle Gold und Rohstoffe getrennt gewichten (All Weather hält von beidem
 * 7,5 %), das Depot beides aber in einer Anlageklasse führt. Erkannt wird Gold am Namen bzw. am
 * Future-Kürzel - eine eigene Kennzeichnung an der Position gibt es nicht, und physisch besicherte
 * Gold-ETCs (Xetra-Gold, 4GLD) tragen es zuverlässig im Namen. Silber, Kupfer und Öl bleiben
 * dadurch korrekt bei den Rohstoffen.
 */
export function isGoldPosition(position: {
  assetClass: AssetClass
  name: string
  symbol: string | null
  identifier: string | null
}): boolean {
  if (position.assetClass !== 'COMMODITY') return false
  if (position.identifier === 'GC=F') return true
  return /gold|4gld/i.test(`${position.name} ${position.symbol ?? ''} ${position.identifier ?? ''}`)
}

/** Der Topf, in dem eine Position im Vergleich erscheint. */
export function positionBucket(position: {
  assetClass: AssetClass
  securityType: SecurityType | null
  subType: CashSubType | null
  name: string
  symbol: string | null
  identifier: string | null
}): AllocationBucket {
  switch (displayClass(position)) {
    case 'STOCK_ETF':
      return 'EQUITY'
    case 'BOND':
      return 'BOND'
    case 'CRYPTO':
      return 'CRYPTO'
    case 'COMMODITY':
      return isGoldPosition(position) ? 'GOLD' : 'COMMODITY'
    case 'CASH_OTHER':
      return 'CASH'
  }
}

/** Das eigene Depot in Euro je Topf. Positionen ohne Kurs bleiben außen vor. */
export function ownBuckets(values: PositionValue[]): Record<AllocationBucket, number> {
  const out = emptyBuckets()
  for (const v of values) {
    if (v.valueEur === null || v.valueEur <= 0) continue
    out[positionBucket(v.position)] += v.valueEur
  }
  return out
}

export interface AllocationRow {
  bucket: AllocationBucket
  /** Wert im eigenen Depot, in Euro. */
  ownEur: number
  /** Anteil im eigenen Depot, 0..1. */
  ownShare: number
  /** Sollanteil des Modells, 0..1. */
  modelShare: number
  /** Eigener Anteil minus Modellanteil, in Prozentpunkten. Positiv = du hast mehr davon. */
  deltaPp: number
  /**
   * Betrag, der umzuschichten wäre, um auf den Modellanteil zu kommen - bezogen auf die
   * Bezugsgröße dieses Vergleichs. Positiv = es fehlt so viel, negativ = so viel zu viel.
   */
  deltaEur: number
}

export interface AllocationComparison {
  rows: AllocationRow[]
  /** Bezugsgröße: die Summe aller berücksichtigten Töpfe, in Euro. */
  total: number
}

/**
 * Eigenes Depot gegen ein Modell.
 *
 * `includeCash` entscheidet über die Bezugsgröße: Modelle sind reine Wertpapier-Allokationen, das
 * Girokonto und eine Immobilie haben darin keinen Platz. Standardmäßig bleiben sie deshalb außen
 * vor, sonst sähe jeder Aktienanteil künstlich niedrig aus. Krypto bleibt immer dabei - es ist
 * angelegtes Geld. Die fest eingebauten Modelle sehen dafür kein Gewicht vor, der Vergleich weist
 * es dort also als Übergewicht aus; ein eigenes Modell kann Bitcoin dagegen gewichten.
 */
export function compareAllocation(
  values: PositionValue[],
  weights: BenchmarkWeights,
  includeCash: boolean
): AllocationComparison {
  const own = ownBuckets(values)
  const model = modelBuckets(weights)
  const buckets = ALLOCATION_BUCKET_ORDER.filter((b) => includeCash || b !== 'CASH')

  const total = buckets.reduce((sum, b) => sum + own[b], 0)
  const modelTotal = buckets.reduce((sum, b) => sum + model[b], 0)

  const rows = buckets.map((bucket) => {
    const ownShare = total > 0 ? own[bucket] / total : 0
    // Auf die berücksichtigten Töpfe normieren: liegt Cash außen vor, bleibt die Modellsumme 1;
    // wird Cash mitgezählt, verteilt sich das Modell weiterhin auf seine eigenen Töpfe.
    const modelShare = modelTotal > 0 ? model[bucket] / modelTotal : 0
    return {
      bucket,
      ownEur: own[bucket],
      ownShare,
      modelShare,
      deltaPp: (ownShare - modelShare) * 100,
      deltaEur: modelShare * total - own[bucket]
    }
  })

  return { rows, total }
}
