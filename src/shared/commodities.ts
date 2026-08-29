import type { QuantityUnit } from './types'

export interface CommodityPreset {
  identifier: string
  name: string
  /** Einheit, in der Yahoo Finance den Future tatsächlich notiert. null = kein Gewicht (z.B. Öl pro Barrel). */
  pricingUnit: QuantityUnit | null
}

export const COMMODITY_PRESETS: CommodityPreset[] = [
  { identifier: 'GC=F', name: 'Gold', pricingUnit: 'TROY_OUNCE' },
  { identifier: 'SI=F', name: 'Silber', pricingUnit: 'TROY_OUNCE' },
  { identifier: 'HG=F', name: 'Kupfer', pricingUnit: 'POUND' },
  { identifier: 'CL=F', name: 'Öl (WTI)', pricingUnit: null }
]

export function commodityPricingUnit(identifier: string | null): QuantityUnit | null {
  if (!identifier) return null
  return COMMODITY_PRESETS.find((p) => p.identifier === identifier)?.pricingUnit ?? null
}
