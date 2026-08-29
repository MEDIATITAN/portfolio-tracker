import { useState } from 'react'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { AssetClass, FxRate, HistoricalFxEntry, HistoricalPriceEntry, Position, ValueSnapshot } from '@shared/types'
import { formatEur, formatPercent } from '../../lib/format'
import { useTheme } from '../../lib/ThemeContext'
import { buildDailyHistoricalSeries } from '../../lib/historicalSeries'

interface ValueOverTimeChartProps {
  snapshots: ValueSnapshot[]
  positions: Position[]
  fxRates: FxRate[]
  historicalPrices: HistoricalPriceEntry[]
  historicalFxRates: HistoricalFxEntry[]
  /** Wenn gesetzt: nur den Wertverlauf dieser Anlageklasse zeigen, statt des Gesamtvermögens. */
  assetClassFilter?: AssetClass | 'ALL'
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
}

type TimeRange = '1D' | '1W' | '1M' | '6M' | 'YTD' | 'ALL'

interface ChartPoint {
  timestamp: number
  syntheticValue: number | null
  realValue: number | null
}

const RANGE_LABELS: Record<TimeRange, string> = {
  '1D': '1T',
  '1W': '1W',
  '1M': '1M',
  '6M': '6M',
  YTD: 'YTD',
  ALL: 'Alle'
}

/** Beschriftung unter der Rendite-Prozentzahl, je gewähltem Zeitraum - statt eines generischen
 *  "im gewählten Zeitraum" für alle. */
const RANGE_SUBTITLES: Record<TimeRange, string> = {
  '1D': 'heute',
  '1W': 'diese Woche',
  '1M': 'diesen Monat',
  '6M': 'letzte 6 Monate',
  YTD: 'dieses Jahr',
  ALL: 'seit Kauf'
}

const RANGE_ORDER: TimeRange[] = ['1D', '1W', '1M', '6M', 'YTD', 'ALL']
const DAY_MS = 24 * 60 * 60 * 1000

function rangeStart(range: TimeRange): number {
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

function formatAxisDate(iso: string, range: TimeRange): string {
  const date = new Date(iso)
  if (range === '1D' || range === '1W') {
    return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function snapshotValue(snapshot: ValueSnapshot, assetClassFilter?: AssetClass | 'ALL'): number {
  if (!assetClassFilter || assetClassFilter === 'ALL') return snapshot.totalValueEur
  return snapshot.items.find((i) => i.assetClass === assetClassFilter)?.valueEur ?? 0
}

export function ValueOverTimeChart({
  snapshots,
  positions,
  fxRates,
  historicalPrices,
  historicalFxRates,
  assetClassFilter,
  hasPositionsInClass,
  hasAnyPositions,
  gainLossPercent,
  onAddPosition,
  expanded = false,
  onToggleExpand
}: ValueOverTimeChartProps): React.JSX.Element {
  const [range, setRange] = useState<TimeRange>('ALL')
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const lineColor = isDark ? '#60a5fa' : '#2563eb'

  const cutoff = rangeStart(range)

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
  const realPoints = filtered.map((s) => ({ timestamp: new Date(s.takenAt).getTime(), value: snapshotValue(s, assetClassFilter) }))

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
      syntheticValue: i === 0 && historicalPoints.length > 0 && historicalPoints[historicalPoints.length - 1].isEstimate ? p.value : null,
      realValue: p.value
    }))
  ]
  const hasEstimatedPortion = historicalPoints.some((p) => p.isEstimate)

  // Nur als "leer" behandeln, wenn wirklich KEINE Position in der Klasse existiert (direktes
  // Signal von außen) - NICHT anhand der Chart-Werte selbst raten (frühere Version hat z.B. bei
  // Aktien&ETFs faelschlich "leer" gemeldet, weil je nach Zeitraum zufällig nur Nullpunkte drin
  // waren, obwohl echte Positionen existieren).
  const isFilteredAndEmpty = assetClassFilter && assetClassFilter !== 'ALL' && hasPositionsInClass === false

  const first = data[0]
  const last = data[data.length - 1]
  const firstValue = first ? (first.syntheticValue ?? first.realValue) : null
  const lastValue = last ? (last.realValue ?? last.syntheticValue) : null
  const rangeChangePercent =
    firstValue !== null && lastValue !== null && firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : null

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
  const positionsWithHistory = positions.filter((p) => p.assetClass !== 'CASH_OTHER' && p.identifier)
  const latestPurchaseMs =
    positionsWithHistory.length > 0
      ? Math.max(...positionsWithHistory.map((p) => new Date(p.purchaseDate ?? p.createdAt).getTime()))
      : null
  const useCostBasisReturn = latestPurchaseMs !== null && cutoff <= latestPurchaseMs
  const displayPercent = useCostBasisReturn ? gainLossPercent : rangeChangePercent
  const rangeChangeLabel = RANGE_SUBTITLES[range]

  return (
    <div
      onClick={onToggleExpand}
      className={`rounded-lg border bg-white p-4 shadow-sm transition-all duration-300 dark:bg-slate-900 ${
        onToggleExpand ? 'cursor-pointer' : ''
      } ${expanded ? 'border-slate-400 ring-2 ring-slate-200 dark:border-slate-500 dark:ring-slate-700' : 'border-slate-200 dark:border-slate-700'}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Vermögen über Zeit</h3>
          {displayPercent !== null && (
            <p
              className={`text-lg font-bold ${displayPercent < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {formatPercent(displayPercent)}{' '}
              <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{rangeChangeLabel}</span>
            </p>
          )}
        </div>
        {hasAnyPositions && (
          <div onClick={(e) => e.stopPropagation()} className="flex shrink-0 gap-0.5">
            {RANGE_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
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
          <p className="text-sm text-slate-400 dark:text-slate-500">Noch keine Positionen erfasst.</p>
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
          <ResponsiveContainer width="100%" height={expanded ? 400 : 240} className="transition-all duration-300">
            <LineChart data={data} margin={{ top: 24, right: 70, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
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
                fontSize={12}
                tickFormatter={(v: number) => formatEur(v)}
                width={90}
                tickLine={false}
                axisLine={false}
                stroke={isDark ? '#94a3b8' : '#64748b'}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatEur(typeof value === 'number' ? value : null),
                  name === 'syntheticValue' ? 'Geschätzt (Einstandspreis)' : 'Getrackt'
                ]}
                labelFormatter={(ts) => (typeof ts === 'number' ? formatAxisDate(new Date(ts).toISOString(), range) : '')}
                contentStyle={{
                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                  borderColor: isDark ? '#475569' : '#e2e8f0',
                  color: isDark ? '#f1f5f9' : '#0f172a'
                }}
                labelStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
              />
              <Line
                type="monotone"
                dataKey="syntheticValue"
                stroke={lineColor}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="realValue"
                stroke={lineColor}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
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
            </LineChart>
          </ResponsiveContainer>
          {hasEstimatedPortion && (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Gestrichelt = geschätzt anhand deines Einstandspreises (keine echten historischen Kurse für diesen Zeitraum verfügbar).
            </p>
          )}
        </>
      )}
    </div>
  )
}
