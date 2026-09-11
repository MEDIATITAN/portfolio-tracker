import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { alignForChart, seriesColor, type AnalysisSeries } from '../../lib/analysisSeries'
import { useTheme } from '../../lib/ThemeContext'

interface BenchmarkChartProps {
  series: AnalysisSeries[]
  /** Ausgeblendete Linien - gesteuert von der Vergleichstabelle darunter. */
  hidden: Set<string>
}

function formatAxisDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { month: '2-digit', year: '2-digit' })
}

/**
 * Y-Achse eng an die tatsächlichen Werte legen.
 *
 * Recharts beginnt sonst bei null - bei einer Indexdarstellung um 100 herum drückte das jede
 * Bewegung in ein flaches Band am oberen Rand.
 */
function indexDomain([dataMin, dataMax]: readonly [number, number]): [number, number] {
  const span = dataMax - dataMin
  const pad = span > 0 ? span * 0.08 : 5
  return [dataMin - pad, dataMax + pad]
}

export function BenchmarkChart({ series, hidden }: BenchmarkChartProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const visible = series.filter((s) => !hidden.has(s.key))
  const rows = alignForChart(visible)

  if (rows.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
        Für diesen Zeitraum liegen keine vergleichbaren Daten vor.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
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
          domain={indexDomain}
          fontSize={12}
          width={56}
          tickFormatter={(v: number) => `${Math.round(v)}`}
          tickLine={false}
          axisLine={false}
          stroke={isDark ? '#94a3b8' : '#64748b'}
        />
        <Tooltip
          formatter={(value, name) => [
            typeof value === 'number' ? `${(value - 100).toFixed(1).replace('.', ',')} %` : '–',
            name
          ]}
          labelFormatter={(ts) =>
            typeof ts === 'number'
              ? new Date(ts).toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                })
              : ''
          }
          contentStyle={{
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            borderColor: isDark ? '#475569' : '#e2e8f0',
            color: isDark ? '#f1f5f9' : '#0f172a'
          }}
          labelStyle={{ color: isDark ? '#f1f5f9' : '#0f172a' }}
        />
        {/* Eigene Legende statt der von Recharts: deren Eintraege kamen in einer anderen
            Reihenfolge als die Linien, wodurch "Dein Depot" mitten zwischen den Modellen stand.
            Die payload-Eigenschaft, mit der sich das vorgeben liesse, gibt es in Recharts 3 nicht
            mehr - also uebernimmt content die Darstellung vollstaendig. */}
        <Legend
          content={() => (
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs">
              {visible.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full"
                    style={{
                      backgroundColor: seriesColor(series, s.key, isDark),
                      width: 14,
                      height: s.isPortfolio ? 3 : 2
                    }}
                  />
                  <span
                    className={
                      s.isPortfolio
                        ? 'font-medium text-slate-900 dark:text-slate-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }
                  >
                    {s.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        />
        {visible.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(series, s.key, isDark)}
            strokeWidth={s.isPortfolio ? 2.6 : 1.4}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
