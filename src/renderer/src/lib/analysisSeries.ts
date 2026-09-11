import { mutedColor, seriesPalette } from './chartColors'
import type { SeriesMetrics, SeriesPoint } from '@shared/benchmarkCalc'

/** Eine Linie im Vergleich: das eigene Depot oder ein Modell, jeweils ab 100 am ersten Tag. */
export interface AnalysisSeries {
  key: string
  label: string
  points: SeriesPoint[]
  metrics: SeriesMetrics | null
  /** Das eigene Depot wird kräftiger gezeichnet und dient als Bezug für "Vorsprung". */
  isPortfolio: boolean
}

export interface ChartRow {
  timestamp: number
  [key: string]: number | null
}

/**
 * Bringt mehrere Reihen auf eine gemeinsame Zeitachse.
 *
 * Nötig, weil die Reihen unterschiedliche Tage kennen: das eigene Depot wird für jeden Kalendertag
 * gerechnet, die Vergleichsmaßstäbe nur für Handelstage - und die unterscheiden sich zwischen
 * Xetra, Amsterdam und New York noch einmal untereinander. Fehlende Tage werden mit dem letzten
 * bekannten Wert überbrückt statt als Lücke gezeichnet: an einem Feiertag fällt ein Depot nicht
 * auf null, es wird nur nicht gehandelt.
 */
export function alignForChart(series: AnalysisSeries[]): ChartRow[] {
  const dates = new Set<string>()
  for (const s of series) for (const p of s.points) dates.add(p.date)
  const sorted = [...dates].sort()

  const cursors = series.map(() => -1)
  return sorted.map((date) => {
    const row: ChartRow = { timestamp: Date.parse(`${date}T00:00:00Z`) }
    series.forEach((s, i) => {
      while (cursors[i] + 1 < s.points.length && s.points[cursors[i] + 1].date <= date) cursors[i]++
      row[s.key] = cursors[i] >= 0 ? s.points[cursors[i]].value : null
    })
    return row
  })
}

/**
 * Farbe einer Linie: die Reihenfolge der Reihen bestimmt sie, das eigene Depot steht immer vorn und
 * bekommt damit die kräftigste Farbe der Palette.
 *
 * Bewusst hier und nicht im Diagramm: die Vergleichstabelle darunter zeichnet dieselben Farben als
 * Punkte vor die Zeilen, und beide müssen zwingend übereinstimmen.
 */
export function seriesColor(series: AnalysisSeries[], key: string, isDark: boolean): string {
  const index = series.findIndex((s) => s.key === key)
  if (index < 0) return mutedColor(isDark)
  return seriesPalette(isDark)[index % seriesPalette(isDark).length]
}
