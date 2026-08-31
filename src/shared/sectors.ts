/**
 * Sektor-Bezeichnungen kommen aus zwei verschiedenen Yahoo-Quellen in unterschiedlicher Schreibweise:
 * - Einzelaktien über `assetProfile.sector`: "Consumer Cyclical", "Real Estate", ...
 * - ETFs über `topHoldings.sectorWeightings`: "consumer_cyclical", "realestate", ...
 * Beide müssen auf denselben Schlüssel normalisiert werden, damit ein Technologie-Anteil aus einem
 * ETF und eine einzelne Technologie-Aktie im Diagramm in DERSELBEN Scheibe landen statt in zwei.
 */
function normalizeSectorKey(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]/g, '')
}

const SECTOR_LABELS_DE: Record<string, string> = {
  technology: 'Technologie',
  financialservices: 'Finanzwesen',
  healthcare: 'Gesundheit',
  consumercyclical: 'Zyklischer Konsum',
  consumerdefensive: 'Basiskonsum',
  industrials: 'Industrie',
  communicationservices: 'Kommunikation',
  energy: 'Energie',
  basicmaterials: 'Grundstoffe',
  realestate: 'Immobilien',
  utilities: 'Versorger'
}

/** Deutsches Label für einen Sektor aus beliebiger Yahoo-Schreibweise; unbekannte bleiben unverändert. */
export function sectorLabelDe(raw: string): string {
  return SECTOR_LABELS_DE[normalizeSectorKey(raw)] ?? raw
}
