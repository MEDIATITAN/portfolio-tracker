import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { CashBalanceEntry, CashBalanceSource, Position } from '@shared/types'
import { seriesPalette } from '../../lib/chartColors'
import { formatDateTime, formatMoney } from '../../lib/format'
import { useTheme } from '../../lib/ThemeContext'

interface CashBalanceHistoryProps {
  position: Position
  /** Die Einträge dieses Kontos, chronologisch. */
  entries: CashBalanceEntry[]
}

const SOURCE_LABELS: Record<CashBalanceSource, string> = {
  OPENING: 'Anfangsstand',
  MANUAL: 'Von Hand geändert',
  BUDGET: 'Budget-Buchung',
  BUDGET_UNDO: 'Buchung zurückgenommen'
}

/** Eingeklappt nur die jüngsten Änderungen zeigen - wie die Vermögenswerte auf dem Dashboard. */
const COLLAPSED_COUNT = 8

interface RecordedPoint {
  timestamp: number
  balance: number
  entry: CashBalanceEntry
  /** Veränderung gegenüber dem vorigen Stand; null beim ersten Eintrag. */
  delta: number | null
}

/** Ein Punkt der Kurve - `entry` fehlt nur am künstlichen Endpunkt, der die Treppe bis heute zieht. */
type ChartPoint = Omit<RecordedPoint, 'entry'> & { entry: CashBalanceEntry | null }

function sourceText(entry: CashBalanceEntry): string {
  const label = SOURCE_LABELS[entry.source]
  return entry.note ? `${label}: ${entry.note}` : label
}

/** Mit Vorzeichen auch bei Zuflüssen: "+500,00 €" liest sich als Bewegung, "500,00 €" als Stand. */
function formatDelta(value: number, currency: string): string {
  return `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`
}

function deltaClass(delta: number | null): string {
  if (delta === null || delta === 0) return 'text-slate-400 dark:text-slate-500'
  return delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
}

function formatAxisDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

/**
 * Y-Achse an die vorkommenden Stände anpassen. Recharts begänne sonst immer bei null, und ein
 * Konto, das zwischen 4.800 und 5.200 schwankt, sähe aus wie eine Gerade. Anders als beim
 * Gesamtvermögen darf die Achse ins Negative reichen: ein Girokonto kann überzogen sein.
 */
function balanceDomain([dataMin, dataMax]: readonly [number, number]): [number, number] {
  const span = dataMax - dataMin
  // Ein einziger Stand ergibt eine Spanne von null - dann eine künstliche, sonst ließe sich die
  // Achse nicht bemaßen.
  const pad = span > 0 ? span * 0.1 : Math.max(Math.abs(dataMax) * 0.05, 1)
  const lower = dataMin >= 0 ? Math.max(0, dataMin - pad) : dataMin - pad
  return [lower, dataMax + pad]
}

/**
 * Der Verlauf eines Kontostands als Treppe: jeder Eintrag ist eine Stufe, zwischen zwei Einträgen
 * gilt der ältere Stand fort. Eine geglättete Kurve wäre hier falsch - Geld auf einem Konto
 * bewegt sich in Sprüngen, nicht stetig.
 */
export function CashBalanceHistory({
  position,
  entries
}: CashBalanceHistoryProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [showAll, setShowAll] = useState(false)
  // Einmal beim Aufklappen bestimmt, nicht bei jedem Rendern: der Endpunkt soll beim Hovern nicht
  // unter dem Mauszeiger weiterlaufen.
  const [now] = useState(() => Date.now())

  const currency = position.currency
  const color = seriesPalette(isDark)[0]
  // Eigene Verlaufs-Kennung je Konto: mehrere aufgeklappte Diagramme dürfen sich nicht denselben
  // SVG-Verlauf teilen.
  const gradientId = `cashArea-${position.id}`

  const recorded: RecordedPoint[] = entries.map((entry, i) => ({
    timestamp: new Date(entry.recordedAt).getTime(),
    balance: entry.balance,
    entry,
    delta: i === 0 ? null : entry.balance - entries[i - 1].balance
  }))
  // Die Treppe bis heute verlängern: der letzte Stand gilt, bis sich etwas ändert. Ohne diesen
  // Punkt endete die Linie beim Datum der letzten Änderung, womöglich Monate zurück.
  const last = recorded[recorded.length - 1]
  const points: ChartPoint[] =
    last && last.timestamp < now
      ? [...recorded, { timestamp: now, balance: last.balance, entry: null, delta: null }]
      : recorded

  const newestFirst = [...recorded].reverse()
  const visible = showAll ? newestFirst : newestFirst.slice(0, COLLAPSED_COUNT)
  const hiddenCount = newestFirst.length - visible.length

  return (
    <div className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Kontostand im Verlauf
        </h4>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Jede Änderung wird festgehalten – von Hand oder durch Budget-Buchungen.
        </p>
      </div>

      {recorded.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Noch kein Verlauf – der erste Eintrag entsteht mit der nächsten Änderung des Kontostands.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={points} margin={{ top: 12, right: 24, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.35 : 0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
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
                tickFormatter={formatAxisDate}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                stroke={isDark ? '#94a3b8' : '#64748b'}
              />
              <YAxis
                domain={balanceDomain}
                tickFormatter={(v: number) => formatMoney(v, currency)}
                width={100}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                stroke={isDark ? '#94a3b8' : '#64748b'}
              />
              <Tooltip
                cursor={{ stroke: isDark ? '#475569' : '#cbd5e1' }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as ChartPoint | undefined
                  if (!active || !point) return null
                  return (
                    <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs shadow dark:border-slate-600 dark:bg-slate-800">
                      <p className="text-slate-500 dark:text-slate-400">
                        {point.entry ? formatDateTime(point.entry.recordedAt) : 'Heute'}
                      </p>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {formatMoney(point.balance, currency)}
                      </p>
                      {point.delta !== null && (
                        <p className={deltaClass(point.delta)}>
                          {formatDelta(point.delta, currency)}
                        </p>
                      )}
                      {point.entry && (
                        <p className="mt-1 text-slate-500 dark:text-slate-400">
                          {sourceText(point.entry)}
                        </p>
                      )}
                    </div>
                  )
                }}
              />
              {/* stepAfter: der neue Stand gilt AB dem Zeitpunkt der Änderung, nicht schon davor. */}
              <Area
                type="stepAfter"
                dataKey="balance"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={{
                  r: 3,
                  fill: color,
                  stroke: isDark ? '#0f172a' : '#ffffff',
                  strokeWidth: 1.5
                }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: isDark ? '#0f172a' : '#ffffff' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          <table className="mt-3 w-full text-xs">
            <thead className="text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="pb-1 font-medium">Zeitpunkt</th>
                <th className="pb-1 pl-4 font-medium">Herkunft</th>
                <th className="pb-1 text-right font-medium">Änderung</th>
                <th className="pb-1 text-right font-medium">Kontostand</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              {visible.map((p) => (
                <tr key={p.entry.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-1 whitespace-nowrap">{formatDateTime(p.entry.recordedAt)}</td>
                  <td className="py-1 pl-4 text-slate-500 dark:text-slate-400">
                    {sourceText(p.entry)}
                  </td>
                  <td className={`py-1 text-right whitespace-nowrap ${deltaClass(p.delta)}`}>
                    {p.delta === null ? '–' : formatDelta(p.delta, currency)}
                  </td>
                  <td className="py-1 text-right font-medium whitespace-nowrap">
                    {formatMoney(p.balance, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(hiddenCount > 0 || showAll) && (
            <button
              type="button"
              onClick={(e) => {
                // Sonst klappt der Klick zusätzlich den Verlauf wieder zu.
                e.stopPropagation()
                setShowAll((v) => !v)
              }}
              className="mt-2 w-full rounded border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {showAll ? 'Weniger anzeigen' : `Alle ${newestFirst.length} Änderungen anzeigen`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
