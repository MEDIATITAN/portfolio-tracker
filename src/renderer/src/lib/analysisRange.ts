/**
 * Zeiträume des Analyse-Bereichs.
 *
 * Bewusst nicht timeRange.ts erweitert: dort gehören "1T" und "seit Kauf" zum Verlaufsdiagramm des
 * Dashboards. Ein Renditevergleich über einen Tag hat keine Aussage, dafür fehlen dort die
 * mehrjährigen Zeiträume, die hier den eigentlichen Zweck ausmachen.
 */
export type AnalysisRange = '6M' | 'YTD' | '1J' | '3J' | '5J' | 'MAX'

export const ANALYSIS_RANGE_LABELS: Record<AnalysisRange, string> = {
  '6M': '6M',
  YTD: 'YTD',
  '1J': '1 Jahr',
  '3J': '3 Jahre',
  '5J': '5 Jahre',
  MAX: 'Maximal'
}

export const ANALYSIS_RANGE_ORDER: AnalysisRange[] = ['6M', 'YTD', '1J', '3J', '5J', 'MAX']

const DAY_MS = 24 * 60 * 60 * 1000

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Startdatum des Zeitraums als 'YYYY-MM-DD'.
 *
 * MAX liefert den frühesten Tag, an dem überhaupt etwas gehalten wurde - der wird vom Aufrufer
 * übergeben, weil er von den Daten abhängt und nicht vom Kalender.
 */
export function analysisRangeStart(range: AnalysisRange, earliestHoldingDay: string): string {
  switch (range) {
    case '6M':
      return daysAgo(182)
    case 'YTD':
      return `${new Date().getFullYear()}-01-01`
    case '1J':
      return daysAgo(365)
    case '3J':
      return daysAgo(3 * 365)
    case '5J':
      return daysAgo(5 * 365)
    case 'MAX':
      return earliestHoldingDay
  }
}
