/**
 * Der Zeitraum, den der Wertverlauf zeigt.
 *
 * Ausgelagert aus ValueOverTimeChart, weil die Auswahl inzwischen auch die Gewinner/Verlierer-
 * Liste steuert: beide müssen denselben Zeitraum meinen, sonst stimmt die Beschriftung nicht mit
 * dem überein, was daneben im Diagramm zu sehen ist.
 */
export type TimeRange = '1D' | '1W' | '1M' | '6M' | 'YTD' | 'ALL'

export const RANGE_LABELS: Record<TimeRange, string> = {
  '1D': '1T',
  '1W': '1W',
  '1M': '1M',
  '6M': '6M',
  YTD: 'YTD',
  ALL: 'Alle'
}

/** Beschriftung unter der Rendite-Prozentzahl, je gewähltem Zeitraum - statt eines generischen
 *  "im gewählten Zeitraum" für alle. */
export const RANGE_SUBTITLES: Record<TimeRange, string> = {
  '1D': 'heute',
  '1W': 'diese Woche',
  '1M': 'diesen Monat',
  '6M': 'letzte 6 Monate',
  YTD: 'dieses Jahr',
  ALL: 'seit Kauf'
}

export const RANGE_ORDER: TimeRange[] = ['1D', '1W', '1M', '6M', 'YTD', 'ALL']

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/**
 * Rasterweite der Stützpunkte im Diagramm.
 *
 * Bei kurzen Zeiträumen bestehen die Punkte aus den Kursabrufen selbst - und die kommen
 * unregelmäßig: wer fünfmal in einer Minute aktualisiert, erzeugt fünf Punkte im selben
 * Augenblick und danach stundenlang keinen. Das Raster fasst je Intervall den JÜNGSTEN Abruf
 * zusammen, sodass gleichmäßige Anhaltspunkte entstehen statt Trauben.
 *
 * Je länger der Zeitraum, desto gröber das Raster.
 */
export function rangeBucketMs(range: TimeRange): number {
  if (range === '1D') return HOUR_MS
  if (range === '1W') return 12 * HOUR_MS
  // Ab einem Monat ist ein Tag die feinste Auflösung, die noch etwas aussagt - und die Reihe vor
  // dem ersten Abruf ist ohnehin tagesweise. Ohne das drängten sich alle Abrufe der letzten Tage
  // als Traube am rechten Rand, während der Rest des Zeitraums aus Tagespunkten besteht.
  return DAY_MS
}

export function rangeStart(range: TimeRange): number {
  const now = Date.now()
  switch (range) {
    case '1D':
      return now - 1 * DAY_MS
    case '1W':
      return now - 7 * DAY_MS
    case '1M':
      return now - 30 * DAY_MS
    case '6M':
      return now - 182 * DAY_MS
    case 'YTD':
      return new Date(new Date().getFullYear(), 0, 1).getTime()
    case 'ALL':
      return -Infinity
  }
}
