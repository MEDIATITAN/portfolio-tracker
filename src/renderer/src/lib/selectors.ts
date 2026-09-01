import type { EtfCompositionEntry } from '@shared/types'
import type { PositionValue } from '@shared/valueCalc'
import { sectorLabelDe } from '@shared/sectors'
import { ASSET_CLASS_LABELS } from './format'
import { displayClass } from '@shared/displayClass'
import { countryToRegion } from './regionMap'

/** Eine einzelne Position und ihr Beitrag zu einer Diagramm-Scheibe. */
export interface SliceContributor {
  label: string
  valueEur: number
}

export interface Slice {
  label: string
  valueEur: number
  /** Woraus sich die Scheibe zusammensetzt - für die Detailansicht beim Anklicken einer Scheibe.
   *  Bei ETFs steht hier bewusst der Fonds selbst mit seinem anteiligen Beitrag, nicht dessen
   *  einzelne Bestandteile. */
  contributors: SliceContributor[]
}

/** Label für den Fondsanteil, dessen Länder Yahoo nicht preisgibt - bewusst sichtbar statt hochgerechnet. */
export const UNRESOLVED_ETF_LABEL = 'ETF – Rest nicht aufschlüsselbar'
const NO_SECTOR_LABEL = 'Ohne Sektorangabe'

/**
 * Sammelt Beträge je Scheibe UND merkt sich, welche Position wie viel dazu beigetragen hat.
 * Beides in einem Durchlauf, damit Diagramm und Detailansicht garantiert dieselben Zahlen zeigen.
 */
function createAccumulator(): {
  add: (sliceLabel: string, positionName: string, amount: number) => void
  toSlices: () => Slice[]
} {
  const bySlice = new Map<string, Map<string, number>>()
  return {
    add(sliceLabel, positionName, amount) {
      let inner = bySlice.get(sliceLabel)
      if (!inner) {
        inner = new Map()
        bySlice.set(sliceLabel, inner)
      }
      inner.set(positionName, (inner.get(positionName) ?? 0) + amount)
    },
    toSlices() {
      const slices: Slice[] = []
      for (const [label, inner] of bySlice) {
        const contributors = [...inner.entries()]
          .filter(([, v]) => v > 0)
          .map(([name, valueEur]) => ({ label: name, valueEur }))
          .sort((a, b) => b.valueEur - a.valueEur)
        const valueEur = contributors.reduce((sum, c) => sum + c.valueEur, 0)
        if (valueEur > 0) slices.push({ label, valueEur, contributors })
      }
      return slices.sort((a, b) => b.valueEur - a.valueEur)
    }
  }
}

/** Eine Slice pro einzelner Position (nicht gruppiert) - für das große bunte Vermögen-Diagramm. */
export function positionBreakdown(values: PositionValue[]): Slice[] {
  return values
    .filter((v): v is typeof v & { valueEur: number } => v.valueEur !== null && v.valueEur > 0)
    .map((v) => ({
      label: v.position.name,
      valueEur: v.valueEur,
      contributors: [{ label: v.position.name, valueEur: v.valueEur }]
    }))
    .sort((a, b) => b.valueEur - a.valueEur)
}

/** Anlageklassen, wobei Aktien und ETFs bewusst GETRENNT ausgewiesen werden (nicht als ein Topf). */
export function assetClassBreakdown(values: PositionValue[]): Slice[] {
  const acc = createAccumulator()
  for (const v of values) {
    if (v.valueEur === null || v.valueEur <= 0) continue
    // Anleihen zuerst abfangen: ein Anleihen-ETF bleibt technisch STOCK_ETF, gehört aber in
    // seinen eigenen Bereich und nicht zu den Aktien-ETFs.
    const cls = displayClass(v.position)
    const label =
      cls === 'STOCK_ETF'
        ? v.position.securityType === 'ETF'
          ? 'ETFs'
          : 'Aktien'
        : ASSET_CLASS_LABELS[cls]
    acc.add(label, v.position.name, v.valueEur)
  }
  return acc.toSlices()
}

/**
 * Sektoren aller Aktien & ETFs. ETFs werden DURCHGESCHAUT: ihr Wert wird anhand der echten
 * Sektorgewichtung des Fonds auf die einzelnen Sektoren verteilt, statt als ein Klotz
 * "ETF/Diversifiziert" zu erscheinen. Yahoos Sektorgewichte decken den kompletten Fonds ab, hier
 * wird also nichts geschätzt. Fonds ohne verfügbare Gewichtung landen in "Ohne Sektorangabe".
 */
export function sectorBreakdown(
  values: PositionValue[],
  compositions: EtfCompositionEntry[]
): Slice[] {
  const acc = createAccumulator()

  for (const v of values) {
    // Anleihen bleiben außen vor: ein Rentenfonds hat keine Aktiensektoren, er würde nur als
    // 'Ohne Sektorangabe' erscheinen und den Rest verwässern.
    if (displayClass(v.position) !== 'STOCK_ETF' || v.valueEur === null || v.valueEur <= 0) continue

    if (v.position.securityType === 'ETF') {
      const parts = compositions.filter(
        (c) => c.identifier === v.position.identifier && c.kind === 'SECTOR'
      )
      const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0)
      if (totalWeight > 0) {
        // Auf die Summe der gelieferten Gewichte normieren (Yahoo rundet, Summe ist selten exakt 1).
        for (const part of parts)
          acc.add(part.label, v.position.name, (v.valueEur * part.weight) / totalWeight)
        continue
      }
      acc.add(NO_SECTOR_LABEL, v.position.name, v.valueEur)
      continue
    }

    acc.add(
      v.position.sector ? sectorLabelDe(v.position.sector) : NO_SECTOR_LABEL,
      v.position.name,
      v.valueEur
    )
  }

  return acc.toSlices()
}

export type RegionGrouping = 'country' | 'continent'

/**
 * Ab dieser Abdeckung gilt der Rest als Rundung und wird anteilig verteilt, statt als graue Scheibe
 * zu erscheinen. Hintergrund: onvista liefert die vom Fondsanbieter gemeldete Länderaufteilung, die
 * bei den Fonds dieses Depots 96,7-100% abdeckt - was fehlt, sind Barmittel (die kein Land haben)
 * und kleine Meldelücken. Diese letzten Prozente proportional zu verteilen ist eine
 * Rundungskorrektur. Reicht die Abdeckung dagegen nicht (Yahoo-Rückfall schafft je nach Fonds nur
 * 37-68%), wäre Hochrechnen geraten - dann bleibt die Lücke sichtbar.
 */
const COUNTRY_NORMALIZE_THRESHOLD = 0.9

/**
 * Regionen aller Aktien & ETFs. Für ETFs liefert Yahoo KEINE fertige Länderaufteilung, nur die
 * größten Einzelpositionen (typisch die Top 10, je nach Fonds ~35-65% des Vermögens). Deren Länder
 * werden exakt aufgelöst und anteilig verteilt; der nicht abgedeckte Rest wird NICHT hochgerechnet,
 * sondern offen als "nicht aufschlüsselbar" ausgewiesen - lieber eine sichtbare Lücke als eine
 * erfundene Länderverteilung.
 */
export function regionBreakdown(
  values: PositionValue[],
  compositions: EtfCompositionEntry[],
  grouping: RegionGrouping
): Slice[] {
  const acc = createAccumulator()
  const groupLabel = (country: string): string =>
    grouping === 'country' ? country : countryToRegion(country)

  for (const v of values) {
    // Wie beim Sektor-Diagramm: Anleihen haben keine Länderaufteilung im Aktiensinn.
    if (displayClass(v.position) !== 'STOCK_ETF' || v.valueEur === null || v.valueEur <= 0) continue

    if (v.position.securityType === 'ETF') {
      const parts = compositions.filter(
        (c) => c.identifier === v.position.identifier && c.kind === 'COUNTRY'
      )
      const covered = parts.reduce((sum, p) => sum + p.weight, 0)
      if (covered > 0) {
        // Bei guter Abdeckung auf die gemeldete Summe normieren (Rest = Barmittel/Rundung),
        // sonst die Gewichte roh lassen und die Lücke offen ausweisen.
        const scale = covered >= COUNTRY_NORMALIZE_THRESHOLD ? 1 / covered : 1
        for (const part of parts)
          acc.add(groupLabel(part.label), v.position.name, v.valueEur * part.weight * scale)
        const rest = 1 - Math.min(covered * scale, 1)
        if (rest > 0.001) acc.add(UNRESOLVED_ETF_LABEL, v.position.name, v.valueEur * rest)
        continue
      }
      acc.add(UNRESOLVED_ETF_LABEL, v.position.name, v.valueEur)
      continue
    }

    acc.add(
      v.position.region ? groupLabel(v.position.region) : UNRESOLVED_ETF_LABEL,
      v.position.name,
      v.valueEur
    )
  }

  return acc.toSlices()
}
