/**
 * Farbreihe für Diagramme mit mehreren gleichrangigen Reihen.
 *
 * Zwei eigenständige Paletten statt einer gemeinsamen: im Hellmodus etwas kräftiger/dunkler (gute
 * Lesbarkeit auf Weiß), im Dunkelmodus deutlich heller (gute Lesbarkeit auf dunklen
 * Kartenhintergründen) - keine der beiden enthält nahezu schwarze oder nahezu weiße Töne.
 *
 * Lag ursprünglich als lokale Konstante im Aufteilungs-Ring. Seit der Analyse-Bereich mehrere
 * Linien in einem Diagramm zeichnet, brauchen beide dieselbe Reihe: zwei getrennte Paletten wären
 * über die Seiten hinweg als Zufall zu erkennen.
 */
export const LIGHT_SERIES_COLORS = [
  '#4f46e5',
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#475569'
]

export const DARK_SERIES_COLORS = [
  '#818cf8',
  '#60a5fa',
  '#4ade80',
  '#fbbf24',
  '#f87171',
  '#a78bfa',
  '#22d3ee',
  '#f472b6',
  '#a3e635',
  '#94a3b8'
]

/** Neutrales Grau für Sammel-, Unbekannt- und Nebenreihen - bewusst keine Signalfarbe. */
export const MUTED_COLOR_LIGHT = '#94a3b8'
export const MUTED_COLOR_DARK = '#64748b'

export function seriesPalette(isDark: boolean): string[] {
  return isDark ? DARK_SERIES_COLORS : LIGHT_SERIES_COLORS
}

export function mutedColor(isDark: boolean): string {
  return isDark ? MUTED_COLOR_DARK : MUTED_COLOR_LIGHT
}
