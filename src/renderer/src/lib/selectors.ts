import type { AssetClass } from '@shared/types'
import { sumByAssetClass, type PositionValue } from '@shared/valueCalc'
import { ASSET_CLASS_LABELS } from './format'
import { countryToRegion } from './regionMap'

export interface Slice {
  label: string
  valueEur: number
}

function sortDesc(slices: Slice[]): Slice[] {
  return slices.sort((a, b) => b.valueEur - a.valueEur)
}

/** Eine Slice pro einzelner Position (nicht gruppiert) - für das große bunte Vermögen-Diagramm. */
export function positionBreakdown(values: PositionValue[]): Slice[] {
  const slices = values
    .filter((v): v is typeof v & { valueEur: number } => v.valueEur !== null && v.valueEur > 0)
    .map((v) => ({ label: v.position.name, valueEur: v.valueEur }))
  return sortDesc(slices)
}

export function assetClassBreakdown(values: PositionValue[]): Slice[] {
  const totals = sumByAssetClass(values)
  const slices = (Object.entries(totals) as [AssetClass, number][])
    .filter(([, valueEur]) => valueEur > 0)
    .map(([assetClass, valueEur]) => ({ label: ASSET_CLASS_LABELS[assetClass], valueEur }))
  return sortDesc(slices)
}

/** Nur Aktien & ETFs: echte Sektoren je Einzelaktie, alle ETFs als ein Block "ETF/Diversifiziert". */
export function sectorBreakdown(values: PositionValue[]): Slice[] {
  const totals = new Map<string, number>()
  for (const v of values) {
    if (v.position.assetClass !== 'STOCK_ETF' || v.valueEur === null) continue
    const label = v.position.securityType === 'ETF' || !v.position.sector ? 'ETF/Diversifiziert' : v.position.sector
    totals.set(label, (totals.get(label) ?? 0) + v.valueEur)
  }
  return sortDesc([...totals.entries()].map(([label, valueEur]) => ({ label, valueEur })))
}

export type RegionGrouping = 'country' | 'continent'

/** Nur Aktien & ETFs, aus demselben Grund wie bei Sektoren wie im Plan festgelegt. */
export function regionBreakdown(values: PositionValue[], grouping: RegionGrouping): Slice[] {
  const totals = new Map<string, number>()
  for (const v of values) {
    if (v.position.assetClass !== 'STOCK_ETF' || v.valueEur === null) continue
    let label: string
    if (v.position.securityType === 'ETF' || !v.position.region) {
      label = 'ETF/Diversifiziert'
    } else if (grouping === 'country') {
      label = v.position.region
    } else {
      label = countryToRegion(v.position.region)
    }
    totals.set(label, (totals.get(label) ?? 0) + v.valueEur)
  }
  return sortDesc([...totals.entries()].map(([label, valueEur]) => ({ label, valueEur })))
}
