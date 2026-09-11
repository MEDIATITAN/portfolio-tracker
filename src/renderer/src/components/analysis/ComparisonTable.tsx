import { formatNumber, formatPercent } from '../../lib/format'
import { seriesColor, type AnalysisSeries } from '../../lib/analysisSeries'
import { useTheme } from '../../lib/ThemeContext'

interface ComparisonTableProps {
  series: AnalysisSeries[]
  hidden: Set<string>
  onToggle: (key: string) => void
}

function signClass(value: number | null): string {
  if (value === null) return 'text-slate-500 dark:text-slate-400'
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (value < 0) return 'text-red-600 dark:text-red-400'
  return 'text-slate-500 dark:text-slate-400'
}

export function ComparisonTable({
  series,
  hidden,
  onToggle
}: ComparisonTableProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const portfolio = series.find((s) => s.isPortfolio)
  const reference = portfolio?.metrics?.totalReturn ?? null

  return (
    <div className="scroll-subtle overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Reihe</th>
            <th className="px-3 py-2 text-right font-medium">Rendite</th>
            <th className="px-3 py-2 text-right font-medium">pro Jahr</th>
            <th className="px-3 py-2 text-right font-medium">Tiefster Rückgang</th>
            <th className="px-3 py-2 text-right font-medium">Schwankung</th>
            <th className="px-3 py-2 text-right font-medium">Rendite/Risiko</th>
            <th
              className="px-3 py-2 text-right font-medium"
              title="Um so viele Prozentpunkte liegt dein Depot vor (grün) oder hinter (rot) dieser Reihe"
            >
              Dein Vorsprung
            </th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => {
            const m = s.metrics
            const diff =
              reference !== null && m && !s.isPortfolio ? reference - m.totalReturn : null
            const isHidden = hidden.has(s.key)
            return (
              <tr
                key={s.key}
                className={`border-t border-slate-100 dark:border-slate-800 ${
                  isHidden ? 'opacity-40' : ''
                } ${s.isPortfolio ? 'font-medium' : ''}`}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onToggle(s.key)}
                    title={isHidden ? 'Linie einblenden' : 'Linie ausblenden'}
                    className="flex items-center gap-2 text-left text-slate-900 dark:text-slate-100"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seriesColor(series, s.key, isDark) }}
                    />
                    <span>{s.label}</span>
                  </button>
                </td>
                <td className={`px-3 py-2 text-right ${signClass(m?.totalReturn ?? null)}`}>
                  {formatPercent(m?.totalReturn ?? null)}
                </td>
                <td className={`px-3 py-2 text-right ${signClass(m?.cagr ?? null)}`}>
                  {formatPercent(m?.cagr ?? null)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                  {formatPercent(m?.maxDrawdown ?? null)}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                  {m?.volatility === null || m?.volatility === undefined
                    ? '–'
                    : `${formatNumber(Math.round(m.volatility * 10) / 10)} %`}
                </td>
                <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                  {m?.sharpe === null || m?.sharpe === undefined
                    ? '–'
                    : formatNumber(Math.round(m.sharpe * 100) / 100)}
                </td>
                <td className={`px-3 py-2 text-right ${signClass(diff)}`}>
                  {s.isPortfolio ? '–' : formatPercent(diff)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
