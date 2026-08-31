import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { UNRESOLVED_ETF_LABEL, type Slice } from '../../lib/selectors'
import { formatEur } from '../../lib/format'
import { useTheme } from '../../lib/ThemeContext'

interface BreakdownDonutProps {
  title: string
  data: Slice[]
  headerExtra?: React.ReactNode
  expanded?: boolean
  onToggleExpand?: () => void
  /** Großer Wert in der Mitte des Rings, z.B. der Gesamtwert - wie im "Vermögen"-Referenzbild. */
  centerLabel?: { value: string; sub: string }
  /** Legende rechts daneben ausblenden - nötig, damit centerLabel exakt über der Ringmitte sitzt
   *  (die Legende würde sonst den verfügbaren Platz für den Pie selbst verschieben). */
  showLegend?: boolean
  height?: number
  /** Obergrenze für die gebündelte "Sonstige"-Scheibe (0..1). Gesetzt, werden so viele Einzelposten
   *  gezeigt, dass der Rest darunter bleibt - statt einer festen Top-5-Grenze. */
  maxOthersShare?: number
  /** Aktuell aufgeschlüsselte Scheibe, oder null für die Standardansicht. Bewusst von außen
   *  gesteuert: so kann immer nur EIN Diagramm gleichzeitig in der Detailansicht stehen. */
  drillLabel: string | null
  onDrillChange: (label: string | null) => void
}

// Zwei eigenständige Paletten statt einer gemeinsamen: im Hellmodus etwas kräftiger/dunkler
// (gute Lesbarkeit auf Weiß), im Dunkelmodus deutlich heller (gute Lesbarkeit auf dunklen
// Kartenhintergründen) - keine der beiden enthält nahezu schwarze oder nahezu weiße Töne.
const LIGHT_COLORS = [
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
const DARK_COLORS = [
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

const OTHERS_LABEL = 'Sonstige'
/** Sammel-/Unbekannt-Scheiben bekommen bewusst ein neutrales Grau statt einer Signalfarbe. */
const MUTED_LABELS = new Set<string>([OTHERS_LABEL, UNRESOLVED_ETF_LABEL])
const MUTED_COLOR_LIGHT = '#94a3b8'
const MUTED_COLOR_DARK = '#64748b'

/** Eingeklappt nur die größten Anteile zeigen, damit die Legende das Diagramm nicht zusammendrückt. */
const COLLAPSED_SLICE_COUNT = 5

/** Detailansicht: so viele Legendenzeilen sind ohne Scrollen sichtbar. Die Zeilenhöhe ergibt sich
 *  aus Recharts' Legenden-Item (Icon 14px, Schrift 12px, display:block - siehe
 *  DefaultLegendContent.js); der Wert ist knapp gewählt, damit die letzte Zeile angeschnitten wird
 *  und dadurch sichtbar bleibt, dass es weitergeht. */
const LEGEND_ROWS_VISIBLE = 5
const LEGEND_ROW_PX = 19

const byValueDesc = (a: Slice, b: Slice): number => b.valueEur - a.valueEur

/**
 * Farben für die Scheiben. Bis zur Länge der kuratierten Palette werden deren abgestimmte Töne
 * genutzt; bei mehr Scheiben (z.B. aufgeklapptes Vermögen-Diagramm mit allen Positionen) wird eine
 * passend große Palette über den goldenen Winkel erzeugt - der verteilt die Farbtöne so über den
 * Farbkreis, dass auch direkt benachbarte Scheiben klar unterscheidbar bleiben.
 */
function buildPalette(count: number, isDark: boolean): string[] {
  const curated = isDark ? DARK_COLORS : LIGHT_COLORS
  if (count <= curated.length) return curated
  const lightness = isDark ? 64 : 48
  return Array.from(
    { length: count },
    (_, i) => `hsl(${Math.round((i * 137.508) % 360)}, 62%, ${lightness}%)`
  )
}

/**
 * Bündelt die kleinsten Posten zu einer "Sonstige"-Scheibe. Mit maxOthersShare werden so viele
 * Einzelposten einzeln gezeigt, bis der gebündelte Rest die Grenze unterschreitet; ohne die Angabe
 * gilt eine feste Top-N-Grenze. "Sonstige" wird bewusst ANGEHÄNGT und nicht nach Größe einsortiert -
 * der Sammelposten soll immer am Ende der Liste stehen.
 */
function collapseSlices(sorted: Slice[], maxOthersShare: number | undefined): Slice[] {
  const total = sorted.reduce((sum, d) => sum + d.valueEur, 0)
  if (total <= 0) return sorted

  let keep = COLLAPSED_SLICE_COUNT
  if (maxOthersShare !== undefined) {
    const limit = total * maxOthersShare
    let rest = total
    keep = 0
    while (keep < sorted.length && rest > limit) {
      rest -= sorted[keep].valueEur
      keep++
    }
  }

  if (sorted.length <= keep + 1) return sorted
  const rest = sorted.slice(keep)
  const restValue = rest.reduce((sum, d) => sum + d.valueEur, 0)
  const top = sorted.slice(0, keep)
  if (restValue <= 0) return top
  // Die Beiträge der gebündelten Scheiben zusammenführen, damit auch "Sonstige" beim Anklicken
  // seine Positionen auflisten kann.
  const restContributors = new Map<string, number>()
  for (const slice of rest) {
    for (const c of slice.contributors)
      restContributors.set(c.label, (restContributors.get(c.label) ?? 0) + c.valueEur)
  }
  return [
    ...top,
    {
      label: OTHERS_LABEL,
      valueEur: restValue,
      contributors: [...restContributors.entries()]
        .map(([label, valueEur]) => ({ label, valueEur }))
        .sort((a, b) => b.valueEur - a.valueEur)
    }
  ]
}

/**
 * Lohnt sich das Aufschlüsseln dieser Scheibe? Eine Scheibe, die nur aus sich selbst besteht (jede
 * einzelne Position im Vermögen-Diagramm), ergäbe eine Detailansicht mit genau einem Segment.
 */
function canDrill(slice: Slice): boolean {
  return slice.contributors.length > 1 || slice.contributors[0]?.label !== slice.label
}

export function BreakdownDonut({
  title,
  data,
  headerExtra,
  expanded = false,
  onToggleExpand,
  centerLabel,
  showLegend = true,
  height: heightProp,
  maxOthersShare,
  drillLabel,
  onDrillChange
}: BreakdownDonutProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const mutedColor = isDark ? MUTED_COLOR_DARK : MUTED_COLOR_LIGHT

  const baseSorted = [...data].sort(byValueDesc)
  const baseCollapsed = collapseSlices(baseSorted, maxOthersShare)
  // Auch in der gebündelten Liste suchen: die Sammelscheibe "Sonstige" existiert nur dort.
  const drillSlice =
    drillLabel === null
      ? undefined
      : (baseSorted.find((s) => s.label === drillLabel) ??
        baseCollapsed.find((s) => s.label === drillLabel))

  // Ab hier läuft die Detailansicht durch dieselbe Diagramm-Darstellung wie die Hauptansicht:
  // gleiche Sortierung, gleiche Legende mit Prozentwerten. Dort wird allerdings NICHT gebündelt -
  // alle Positionen der Kategorie sind im Ring, die Legende zeigt die größten und scrollt.
  const chartSlices: Slice[] = drillSlice
    ? drillSlice.contributors
        .map((c) => ({ label: c.label, valueEur: c.valueEur, contributors: [c] }))
        .sort(byValueDesc)
    : baseSorted
  const visible: Slice[] = drillSlice ? chartSlices : expanded ? chartSlices : baseCollapsed

  const total = chartSlices.reduce((sum, d) => sum + d.valueEur, 0)
  // Bewusst unabhängig von der Detailansicht: der Ring behält beim Hineinklicken exakt seine Größe -
  // wird die Liste zu lang, scrollt stattdessen die Legende.
  const height = heightProp ?? (expanded ? 420 : 220)
  // Detailansicht: die Legende auf rund fünf Zeilen begrenzen, der Rest ist per Scrollen erreichbar.
  const legendMaxHeight = drillSlice
    ? Math.min(height - 16, LEGEND_ROWS_VISIBLE * LEGEND_ROW_PX)
    : height - 16
  // In der Detailansicht muss die Legende an sein - sonst bliebe der Ring unbeschriftet. Und der
  // centerLabel-Wert der Hauptansicht (Gesamtvermögen) gilt für eine einzelne Kategorie nicht mehr.
  const legendVisible = drillSlice ? true : showLegend
  const center = drillSlice ? undefined : centerLabel

  const dataWithPercent = visible.map((d) => ({
    ...d,
    labelWithPercent: `${d.label} (${total > 0 ? ((d.valueEur / total) * 100).toFixed(1) : '0'}%)`
  }))
  const palette = buildPalette(dataWithPercent.length, isDark)
  const hiddenCount = chartSlices.length - visible.length

  // In der Detailansicht hängt kein Klick an der Karte selbst: dort steuern "Zurück" und der
  // Anzeigen-Knopf, damit ein Klick daneben die Ansicht nicht versehentlich umwirft.
  const handleCardClick = drillSlice ? undefined : onToggleExpand

  return (
    <div
      onClick={handleCardClick}
      className={`min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900 ${
        handleCardClick ? 'cursor-pointer' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        {drillSlice ? (
          <div className="min-w-0">
            {/* Der Name der angeklickten Kategorie bleibt oben stehen, bewusst größer als der Rest. */}
            <h3 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
              {drillSlice.label}
            </h3>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {formatEur(drillSlice.valueEur)} · {title}
            </p>
          </div>
        ) : (
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
        )}
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          {drillSlice ? (
            <button
              type="button"
              onClick={() => onDrillChange(null)}
              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Zurück
            </button>
          ) : (
            headerExtra
          )}
        </div>
      </div>
      {chartSlices.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">Keine Daten</p>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer
              width="100%"
              height={height}
              className="transition-all duration-300"
            >
              <PieChart>
                <Pie
                  data={dataWithPercent}
                  dataKey="valueEur"
                  nameKey="labelWithPercent"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={2}
                  className={drillSlice ? undefined : 'cursor-pointer'}
                  // stopPropagation: sonst würde der Klick zusätzlich das Auf-/Zuklappen der Karte
                  // auslösen (onClick liegt auf dem umgebenden Container).
                  onClick={(_entry, index, event) => {
                    event.stopPropagation()
                    if (drillSlice) return
                    const slice = visible[index]
                    if (slice && canDrill(slice)) onDrillChange(slice.label)
                  }}
                >
                  {dataWithPercent.map((entry, i) => (
                    <Cell
                      key={entry.label}
                      fill={
                        MUTED_LABELS.has(entry.label) ? mutedColor : palette[i % palette.length]
                      }
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatEur(typeof value === 'number' ? value : null)}
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderColor: isDark ? '#475569' : '#e2e8f0',
                    color: isDark ? '#f1f5f9' : '#0f172a'
                  }}
                  labelStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
                />
                {legendVisible && (
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    // Recharts sortiert die Legende standardmäßig mit itemSorter='value' - und
                    // "value" ist bei einem Pie der BESCHRIFTUNGSTEXT, die Legende wäre also
                    // alphabetisch statt nach Größe sortiert (siehe legendSelectors.js). null
                    // schaltet das ab und übernimmt die Datenreihenfolge (absteigend nach Wert).
                    itemSorter={null}
                    // Höhe begrenzen + scrollen: sonst drückt eine lange Legende (aufgeklappt bei
                    // vielen Einträgen) den Ring immer kleiner, je mehr Positionen vorhanden sind.
                    wrapperStyle={{
                      fontSize: 12,
                      color: isDark ? '#cbd5e1' : '#334155',
                      maxHeight: legendMaxHeight,
                      overflowY: 'auto'
                    }}
                  />
                )}
              </PieChart>
            </ResponsiveContainer>
            {center && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {center.value}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{center.sub}</span>
              </div>
            )}
          </div>
          {drillSlice
            ? chartSlices.length > LEGEND_ROWS_VISIBLE && (
                <p className="mt-1 text-center text-xs text-slate-400 dark:text-slate-500">
                  {chartSlices.length} Positionen · in der Liste scrollen
                </p>
              )
            : hiddenCount > 0 && (
                <p className="mt-1 text-center text-xs text-slate-400 dark:text-slate-500">
                  Zum Aufklappen klicken ({hiddenCount} weitere)
                </p>
              )}
        </>
      )}
    </div>
  )
}
