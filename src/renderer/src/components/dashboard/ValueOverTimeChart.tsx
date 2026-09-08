import type { DisplayClass } from '@shared/displayClass'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type {
  FxRate,
  HistoricalFxEntry,
  HistoricalPriceEntry,
  IntradayPriceEntry,
  Position,
  ValueSnapshot
} from '@shared/types'
import { formatEur, formatPercent } from '../../lib/format'
import { useTheme } from '../../lib/ThemeContext'
import { buildDailyHistoricalSeries } from '../../lib/historicalSeries'
import { buildHourlySeries } from '../../lib/hourlySeries'
import {
  RANGE_LABELS,
  RANGE_ORDER,
  RANGE_SUBTITLES,
  rangeBucketMs,
  rangeStart,
  type TimeRange
} from '../../lib/timeRange'

interface ValueOverTimeChartProps {
  snapshots: ValueSnapshot[]
  positions: Position[]
  fxRates: FxRate[]
  historicalPrices: HistoricalPriceEntry[]
  historicalFxRates: HistoricalFxEntry[]
  /** Stundenkurse der letzten Tage - tragen die Zeiträume "1 Tag" und "1 Woche". */
  intradayPrices: IntradayPriceEntry[]
  /** Wenn gesetzt: nur den Wertverlauf dieser Anlageklasse zeigen, statt des Gesamtvermögens. */
  assetClassFilter?: DisplayClass | 'ALL'
  /** Ob es aktuell überhaupt Positionen in der gefilterten Anlageklasse gibt. */
  hasPositionsInClass?: boolean
  /** Ob überhaupt irgendeine Position existiert (unabhängig vom Filter) - dann Button statt Chart. */
  hasAnyPositions: boolean
  /** Gewinn/Verlust ggü. Einstandspreis in Prozent (wie NetWorthCard) - echte Rendite je Position
   *  seit deren eigenem Kaufdatum, unabhängig davon wann sie zum Portfolio dazukam. Für "Alle"
   *  verwendet statt eines reinen Wert-Vergleichs (siehe rangeChangePercent unten). */
  gainLossPercent: number | null
  onAddPosition: () => void
  expanded?: boolean
  onToggleExpand?: () => void
  /** Gewählter Zeitraum. Von außen gesteuert, damit die Gewinner/Verlierer-Liste daneben
   *  denselben Zeitraum auswertet wie das Diagramm. */
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
}

interface ChartPoint {
  timestamp: number
  syntheticValue: number | null
  realValue: number | null
}

function formatAxisDate(iso: string, range: TimeRange): string {
  const date = new Date(iso)
  // Innerhalb eines Tages ist das Datum überall gleich - die Uhrzeit allein ist lesbarer.
  if (range === '1D') {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }
  if (range === '1W') {
    return date.toLocaleString('de-DE', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Y-Achse an die im gewählten Zeitraum tatsächlich vorkommenden Werte anpassen.
 *
 * Recharts' Standard-Domain ist [0, 'auto'] (defaultNumericDomain in axisSelectors.js), die Achse
 * beginnt also immer bei null. Bei einem Tages- oder Wochenausschnitt, in dem sich das Vermögen um
 * ein paar Euro bewegt, presst das die gesamte Bewegung in eine scheinbar flache Linie am oberen
 * Rand. Da die Domain hier fest vorgegeben ist, verwendet Recharts getTickValuesFixedDomain und
 * verteilt die Beschriftungen INNERHALB dieser Grenzen, statt sie nach außen aufzurunden.
 */
function valueDomain([dataMin, dataMax]: readonly [number, number]): [number, number] {
  const span = dataMax - dataMin
  // Ohne Rand lägen Hoch- und Tiefpunkt exakt auf der Diagrammkante. Ist die Linie völlig flach
  // (nur ein Punkt im Zeitraum), muss eine künstliche Spanne her - eine null hohe Achse könnte
  // Recharts nicht bemaßen.
  const pad = span > 0 ? span * 0.08 : Math.max(Math.abs(dataMax) * 0.02, 1)
  // Negatives Vermögen gibt es nicht, die untere Grenze bleibt bei null.
  return [Math.max(0, dataMin - pad), dataMax + pad]
}

/**
 * Fasst die Punkte auf ein festes Raster zusammen und behält je Intervall den JÜNGSTEN Wert -
 * der ist am nächsten an dem, was am Ende des Intervalls tatsächlich im Depot stand.
 */
function bucketByInterval(
  points: { timestamp: number; value: number }[],
  bucketMs: number
): { timestamp: number; value: number }[] {
  if (points.length === 0) return points
  const byBucket = new Map<number, { timestamp: number; value: number }>()
  // Die Punkte kommen chronologisch - ein späterer Eintrag überschreibt den früheren im
  // selben Intervall.
  for (const p of points) byBucket.set(Math.floor(p.timestamp / bucketMs), p)
  return [...byBucket.values()]
}

/**
 * Farbe der Kurve: grün bei Wertzuwachs im gewählten Zeitraum, rot bei Rückgang.
 *
 * Bewusst an DERSELBEN Prozentzahl ausgerichtet, die über dem Diagramm steht - eine grüne
 * Kurve über einer roten Zahl wäre schlimmer als gar keine Färbung.
 */
function seriesColors(positive: boolean, isDark: boolean): { line: string; fill: string } {
  if (positive) {
    return { line: isDark ? '#34d399' : '#059669', fill: isDark ? '#34d399' : '#10b981' }
  }
  return { line: isDark ? '#f87171' : '#dc2626', fill: isDark ? '#f87171' : '#ef4444' }
}

function snapshotValue(snapshot: ValueSnapshot, assetClassFilter?: DisplayClass | 'ALL'): number {
  if (!assetClassFilter || assetClassFilter === 'ALL') return snapshot.totalValueEur
  return snapshot.items.find((i) => i.assetClass === assetClassFilter)?.valueEur ?? 0
}

export function ValueOverTimeChart({
  snapshots,
  positions,
  fxRates,
  historicalPrices,
  historicalFxRates,
  intradayPrices,
  assetClassFilter,
  hasPositionsInClass,
  hasAnyPositions,
  gainLossPercent,
  onAddPosition,
  expanded = false,
  onToggleExpand,
  range,
  onRangeChange
}: ValueOverTimeChartProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const cutoff = rangeStart(range)
  // Bei kurzen Zeiträumen wird der Verlauf aus Stundenkursen nachgerechnet statt aus den
  // Momentaufnahmen: die entstehen nur bei geöffneter App und hinterlassen sonst Lücken.
  const useHourly = range === '1D' || range === '1W'
  // Ende der Stundenreihe ist der jüngste vorhandene Datenpunkt, nicht die aktuelle Uhrzeit:
  // die Ableitung soll allein von den übergebenen Daten abhängen und bei gleichen Daten
  // dasselbe Ergebnis liefern.
  const seriesEndMs =
    snapshots.length > 0 ? new Date(snapshots[snapshots.length - 1].takenAt).getTime() : cutoff

  // Reihe VOR dem ersten echten Snapshot: primär aus echten historischen Kursen (Yahoo/
  // CoinGecko/Frankfurter), pro Tag/Position auf den Einstandspreis zurückfallend wo keine
  // vorhanden sind (z.B. CoinGeckos 365-Tage-Limit). Bezieht sich auf ALLE Snapshots (nicht die
  // zeitraum-gefilterten), damit "erster echter Snapshot" nicht vom gewählten Zeitraum abhängt.
  const firstRealSnapshot = snapshots[0] ?? null
  const firstRealSnapshotDay = firstRealSnapshot ? firstRealSnapshot.takenAt.slice(0, 10) : null
  const historicalPoints = buildDailyHistoricalSeries(
    positions,
    historicalPrices,
    historicalFxRates,
    fxRates,
    firstRealSnapshotDay
  ).filter((p) => p.timestamp >= cutoff)

  const filtered = snapshots.filter((s) => new Date(s.takenAt).getTime() >= cutoff)
  // `timestamp` (statt eines vorformatierten Datumsstrings) treibt die X-Achse an: mehrere
  // Snapshots vom selben Tag hätten sonst denselben Achsen-Label bekommen, Recharts fasst
  // Punkte mit gleichem Kategorie-Label auf einer kategorialen Achse zusammen - beim Hovern
  // wurde dadurch immer derselbe (erste) Punkt der Gruppe angezeigt, obwohl die Linie zwischen
  // echten, unterschiedlichen Werten verläuft. Mit einer numerischen Achse ist jeder Zeitstempel
  // eindeutig positioniert.
  const hourlyPoints = useHourly
    ? buildHourlySeries(
        positions,
        intradayPrices,
        historicalPrices,
        historicalFxRates,
        fxRates,
        cutoff,
        seriesEndMs
      )
    : []

  const snapshotPoints = filtered.map((s) => ({
    timestamp: new Date(s.takenAt).getTime(),
    value: snapshotValue(s, assetClassFilter)
  }))

  // Den letzten Punkt liefert weiterhin die jüngste Momentaufnahme: sie enthält den echten,
  // eben abgerufenen Depotwert - die Stundenreihe endet auf der letzten vollen Stunde.
  const newestSnapshot = snapshotPoints[snapshotPoints.length - 1] ?? null
  const hourlyWithLatest =
    newestSnapshot &&
    newestSnapshot.timestamp > (hourlyPoints[hourlyPoints.length - 1]?.timestamp ?? 0)
      ? [...hourlyPoints, newestSnapshot]
      : hourlyPoints
  // Auch die Stundenreihe wird gerastert: bei "1 Woche" sind 168 Stundenpunkte zu dicht, dort
  // sind 12-Stunden-Schritte gewollt. Bei "1 Tag" ist das Raster genau eine Stunde und ändert
  // an der Reihe nichts.
  const realPoints = bucketByInterval(
    useHourly && hourlyPoints.length > 0 ? hourlyWithLatest : snapshotPoints,
    rangeBucketMs(range)
  )

  // Zwei getrennte Datenreihen (gestrichelt/durchgezogen) statt einer: der erste echte Punkt
  // bekommt bewusst BEIDE Werte, damit sich gestrichelte und durchgezogene Linie optisch berühren.
  const data: ChartPoint[] = [
    ...historicalPoints.map((p) => ({
      timestamp: p.timestamp,
      syntheticValue: p.isEstimate ? p.value : null,
      realValue: p.isEstimate ? null : p.value
    })),
    ...realPoints.map((p, i) => ({
      timestamp: p.timestamp,
      syntheticValue:
        i === 0 &&
        historicalPoints.length > 0 &&
        historicalPoints[historicalPoints.length - 1].isEstimate
          ? p.value
          : null,
      realValue: p.value
    }))
  ]
  const hasEstimatedPortion = historicalPoints.some((p) => p.isEstimate)

  // Nur als "leer" behandeln, wenn wirklich KEINE Position in der Klasse existiert (direktes
  // Signal von außen) - NICHT anhand der Chart-Werte selbst raten (frühere Version hat z.B. bei
  // Aktien&ETFs faelschlich "leer" gemeldet, weil je nach Zeitraum zufällig nur Nullpunkte drin
  // waren, obwohl echte Positionen existieren).
  const isFilteredAndEmpty =
    assetClassFilter && assetClassFilter !== 'ALL' && hasPositionsInClass === false

  const first = data[0]
  const last = data[data.length - 1]
  const firstValue = first ? (first.syntheticValue ?? first.realValue) : null
  const lastValue = last ? (last.realValue ?? last.syntheticValue) : null
  const rangeChangePercent =
    firstValue !== null && lastValue !== null && firstValue !== 0
      ? ((lastValue - firstValue) / firstValue) * 100
      : null

  // Ein reiner Wert-Vergleich (erster vs. letzter sichtbarer Punkt) ist nur dann eine sinnvolle
  // Rendite, wenn sich die Portfolio-Zusammensetzung INNERHALB des gewählten Zeitraums nicht mehr
  // ändert - sonst misst er faktisch "wie sehr ist das Konto durch neue Käufe gewachsen" statt
  // "wie gut haben sich die Anlagen entwickelt" (User-Feedback: "Alle" und YTD zeigten >2000%,
  // weil der Zeitraum-Start vor die meisten Käufe fiel und firstValue dadurch nahezu 0 war).
  // Deshalb: sobald der jüngste Kauf NACH dem Start des gewählten Zeitraums liegt (die Zusammen-
  // setzung sich also noch innerhalb des Fensters verändert hat), stattdessen dieselbe
  // Gewinn/Verlust-vs-Einstandspreis-Rendite wie NetWorthCard zeigen - die ist unabhängig davon,
  // wann welche Position dazukam. Bei kurzen, aktuellen Zeiträumen (i.d.R. 1T/1W/1M) bleibt der
  // Wert-Vergleich in Kraft, weil dort typischerweise keine neuen Positionen mehr dazukamen.
  const positionsWithHistory = positions.filter(
    (p) => p.assetClass !== 'CASH_OTHER' && p.identifier
  )
  const latestPurchaseMs =
    positionsWithHistory.length > 0
      ? Math.max(
          ...positionsWithHistory.map((p) => new Date(p.purchaseDate ?? p.createdAt).getTime())
        )
      : null
  const useCostBasisReturn = latestPurchaseMs !== null && cutoff <= latestPurchaseMs
  const displayPercent = useCostBasisReturn ? gainLossPercent : rangeChangePercent
  const rangeChangeLabel = RANGE_SUBTITLES[range]
  // Ohne Prozentzahl (zu wenig Daten) bleibt es bei Grün - eine rote Kurve würde einen
  // Verlust behaupten, den niemand gemessen hat.
  const colors = seriesColors((displayPercent ?? 0) >= 0, isDark)
  const lineColor = colors.line
  // Eigene Verlaufs-Kennung je Anlageklasse: zwei Diagramme auf einer Seite dürfen sich nicht
  // denselben SVG-Verlauf teilen, sonst gewinnt der zuletzt gerenderte für beide.
  const gradientId = `valueArea-${assetClassFilter ?? 'ALL'}`
  // Die Stützstellen sichtbar machen, solange es wenige sind: bei "1 Tag" und "1 Woche" ist
  // genau das der Punkt der Rasterung - man soll sehen, WANN gemessen wurde. Bei Hunderten
  // Punkten verschmelzen die Markierungen zu einem Band und machen die Kurve unleserlich.
  const showDots = data.length <= 40

  return (
    // h-full: nebeneinanderstehende Karten sollen gleich hoch abschließen, auch wenn ihre
    // Überschriften unterschiedlich viele Zeilen brauchen.
    <div
      onClick={onToggleExpand}
      className={`h-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 dark:border-slate-700 dark:bg-slate-900 ${
        onToggleExpand ? 'cursor-pointer' : ''
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Vermögen über Zeit
          </h3>
          {displayPercent !== null && (
            <p
              className={`text-lg font-bold ${displayPercent < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {formatPercent(displayPercent)}{' '}
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                {rangeChangeLabel}
              </span>
            </p>
          )}
        </div>
        {hasAnyPositions && (
          <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 gap-0.5">
            {RANGE_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={`rounded px-2 py-0.5 text-xs ${
                  range === r
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}
      </div>
      {!hasAnyPositions ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Noch keine Positionen erfasst.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddPosition()
            }}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Position hinzufügen
          </button>
        </div>
      ) : isFilteredAndEmpty ? (
        <p className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          Keine Positionen in dieser Anlageklasse.
        </p>
      ) : data.length < 2 ? (
        <p className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">
          {snapshots.length < 2
            ? 'Noch nicht genug Datenpunkte – jeder Kursabruf fügt einen hinzu.'
            : 'Keine Datenpunkte in diesem Zeitraum.'}
        </p>
      ) : (
        <>
          <ResponsiveContainer
            width="100%"
            height={expanded ? 400 : 240}
            className="transition-all duration-300"
          >
            <AreaChart data={data} margin={{ top: 24, right: 70, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.fill} stopOpacity={isDark ? 0.35 : 0.28} />
                  <stop offset="100%" stopColor={colors.fill} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                stroke={isDark ? '#334155' : '#e2e8f0'}
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(ts: number) => formatAxisDate(new Date(ts).toISOString(), range)}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                stroke={isDark ? '#94a3b8' : '#64748b'}
              />
              <YAxis
                domain={valueDomain}
                fontSize={12}
                tickFormatter={(v: number) => formatEur(v)}
                width={90}
                tickLine={false}
                axisLine={false}
                stroke={isDark ? '#94a3b8' : '#64748b'}
              />
              <Tooltip
                // Nur den Betrag zeigen, ohne Bezeichnung davor. null (nicht '') als Name ist
                // wichtig: Recharts blendet Name UND Trennzeichen nur dann aus, wenn der Name
                // weder Zahl noch String ist - bei '' bliebe ein " : " stehen.
                formatter={(value) => [formatEur(typeof value === 'number' ? value : null), null]}
                labelFormatter={(ts) =>
                  typeof ts === 'number' ? formatAxisDate(new Date(ts).toISOString(), range) : ''
                }
                contentStyle={{
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  borderColor: isDark ? '#475569' : '#e2e8f0',
                  color: isDark ? '#f1f5f9' : '#0f172a'
                }}
                labelStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
              />
              {/* Der geschätzte Teil bleibt ohne Füllung: eine durchgehend gefüllte Fläche
                  würde ihn wie gemessene Daten aussehen lassen. */}
              <Area
                type="monotone"
                dataKey="syntheticValue"
                stroke={lineColor}
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="none"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="realValue"
                stroke={lineColor}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={
                  showDots
                    ? {
                        r: 3,
                        fill: lineColor,
                        stroke: isDark ? '#0f172a' : '#ffffff',
                        strokeWidth: 1.5
                      }
                    : false
                }
                activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? '#0f172a' : '#ffffff' }}
                connectNulls
              />
              {last && lastValue !== null && (
                <ReferenceDot
                  x={last.timestamp}
                  y={lastValue}
                  r={4}
                  fill={lineColor}
                  stroke={isDark ? '#0f172a' : '#ffffff'}
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                >
                  <Label
                    value={formatEur(lastValue)}
                    position="top"
                    offset={12}
                    fill={lineColor}
                    fontSize={13}
                    fontWeight={700}
                  />
                </ReferenceDot>
              )}
            </AreaChart>
          </ResponsiveContainer>
          {hasEstimatedPortion && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Gestrichelt = geschätzt anhand deines Einstandspreises (keine echten historischen
              Kurse für diesen Zeitraum verfügbar).
            </p>
          )}
        </>
      )}
    </div>
  )
}
