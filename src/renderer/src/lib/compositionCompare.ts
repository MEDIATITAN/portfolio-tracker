/**
 * Zwei Aufteilungen gegenüberstellen - das eigene Depot und die eines Modells.
 *
 * Beide Seiten werden auf 100 % ihrer selbst normiert, erst dadurch sind sie vergleichbar: das
 * eigene Depot ist fünfstellig in Euro, das Modell hat überhaupt keine Beträge. Verglichen wird
 * deshalb immer nur die Form der Aufteilung, nie die Größe.
 */

import type { EtfCompositionEntry } from '@shared/types'
import type { Slice } from './selectors'

export interface ShareEntry {
  label: string
  /** Anteil an der jeweiligen Seite, 0..1. */
  share: number
}

export interface ShareComparisonRow {
  label: string
  ownShare: number
  modelShare: number
  /** Eigener Anteil minus Modellanteil, in Prozentpunkten. */
  deltaPp: number
}

/** Sammel-Zeile für den langen Schwanz kleiner Posten. */
export const REST_LABEL = 'Übrige'

function normalize(entries: ShareEntry[]): ShareEntry[] {
  const total = entries.reduce((sum, e) => sum + e.share, 0)
  if (total <= 0) return []
  return entries.map((e) => ({ label: e.label, share: e.share / total }))
}

/** Die Scheiben eines Diagramms (in Euro) als Anteile. */
export function slicesToShares(slices: Slice[]): ShareEntry[] {
  return normalize(slices.map((s) => ({ label: s.label, share: s.valueEur })))
}

/**
 * Die gespeicherte Aufteilung eines Fonds oder Index als Anteile.
 *
 * `groupLabel` fasst Länder zu Kontinenten zusammen - dieselbe Funktion, die auch das
 * Aufteilungs-Diagramm auf der Übersicht benutzt, damit beide Seiten dieselben Namen tragen.
 */
export function compositionShares(
  compositions: EtfCompositionEntry[],
  identifier: string,
  kind: 'SECTOR' | 'COUNTRY',
  groupLabel: (label: string) => string = (label) => label
): ShareEntry[] {
  const byLabel = new Map<string, number>()
  for (const entry of compositions) {
    if (entry.identifier !== identifier || entry.kind !== kind || entry.weight <= 0) continue
    const label = groupLabel(entry.label)
    byLabel.set(label, (byLabel.get(label) ?? 0) + entry.weight)
  }
  return normalize([...byLabel].map(([label, share]) => ({ label, share })))
}

/**
 * Beide Seiten zu einer Tabelle zusammenführen, absteigend nach dem größeren der beiden Anteile.
 *
 * Sortiert wird nach dem Maximum und nicht nach dem eigenen Anteil: eine Branche, die im Modell
 * 12 % ausmacht und im eigenen Depot gar nicht vorkommt, ist die interessanteste Zeile überhaupt -
 * sie stünde sonst ganz unten.
 */
export function compareShares(
  own: ShareEntry[],
  model: ShareEntry[],
  limit = 10
): ShareComparisonRow[] {
  const labels = new Set<string>([...own.map((e) => e.label), ...model.map((e) => e.label)])
  const ownBy = new Map(own.map((e) => [e.label, e.share]))
  const modelBy = new Map(model.map((e) => [e.label, e.share]))

  const rows = [...labels]
    .map((label) => {
      const ownShare = ownBy.get(label) ?? 0
      const modelShare = modelBy.get(label) ?? 0
      return { label, ownShare, modelShare, deltaPp: (ownShare - modelShare) * 100 }
    })
    .sort((a, b) => Math.max(b.ownShare, b.modelShare) - Math.max(a.ownShare, a.modelShare))

  if (rows.length <= limit) return rows

  const head = rows.slice(0, limit)
  const tail = rows.slice(limit)
  const rest = tail.reduce(
    (sum, r) => ({ own: sum.own + r.ownShare, model: sum.model + r.modelShare }),
    { own: 0, model: 0 }
  )
  return [
    ...head,
    {
      label: REST_LABEL,
      ownShare: rest.own,
      modelShare: rest.model,
      deltaPp: (rest.own - rest.model) * 100
    }
  ]
}
