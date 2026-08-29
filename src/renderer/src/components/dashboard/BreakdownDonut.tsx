import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import type { Slice } from '../../lib/selectors'
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

export function BreakdownDonut({
  title,
  data,
  headerExtra,
  expanded = false,
  onToggleExpand,
  centerLabel,
  showLegend = true,
  height: heightProp
}: BreakdownDonutProps): React.JSX.Element {
  const { theme } = useTheme()
  const height = heightProp ?? (expanded ? 340 : 220)
  const isDark = theme === 'dark'
  const colors = isDark ? DARK_COLORS : LIGHT_COLORS

  const total = data.reduce((sum, d) => sum + d.valueEur, 0)
  const dataWithPercent = data.map((d) => ({
    ...d,
    labelWithPercent: `${d.label} (${total > 0 ? ((d.valueEur / total) * 100).toFixed(1) : '0'}%)`
  }))

  return (
    <div
      onClick={onToggleExpand}
      className={`min-w-0 rounded-lg border bg-white p-4 shadow-sm transition-all duration-300 dark:bg-slate-900 ${
        onToggleExpand ? 'cursor-pointer' : ''
      } ${expanded ? 'border-slate-400 ring-2 ring-slate-200 dark:border-slate-500 dark:ring-slate-700' : 'border-slate-200 dark:border-slate-700'}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
        {headerExtra && (
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            {headerExtra}
          </div>
        )}
      </div>
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-400 dark:text-slate-500">Keine Daten</p>
      ) : (
        <div className="relative">
          <ResponsiveContainer width="100%" height={height} className="transition-all duration-300">
            <PieChart>
              <Pie
                data={dataWithPercent}
                dataKey="valueEur"
                nameKey="labelWithPercent"
                innerRadius="50%"
                outerRadius="80%"
                paddingAngle={2}
              >
                {dataWithPercent.map((entry, i) => (
                  <Cell key={entry.label} fill={colors[i % colors.length]} />
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
              {showLegend && (
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  wrapperStyle={{ fontSize: 12, color: isDark ? '#cbd5e1' : '#334155' }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
          {centerLabel && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{centerLabel.value}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{centerLabel.sub}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
