import type { ShareComparisonRow } from '../../lib/compositionCompare'
import { formatPercent, formatShare } from '../../lib/format'
import { mutedColor, seriesPalette } from '../../lib/chartColors'
import { useTheme } from '../../lib/ThemeContext'

interface ShareCompareTableProps {
  rows: ShareComparisonRow[]
  modelLabel: string
  /** Was steht, wenn eine der beiden Seiten nichts hergibt. */
  emptyHint: string
}

/** Ab dieser Abweichung wird die Zeile farblich hervorgehoben. */
const NOTABLE_PP = 3

function deltaClass(deltaPp: number): string {
  if (Math.abs(deltaPp) < NOTABLE_PP) return 'text-slate-500 dark:text-slate-400'
  return deltaPp > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400'
}

/**
 * Zwei Aufteilungen Zeile für Zeile: Branchen oder Länder des eigenen Aktienanteils gegen die des
 * Index, auf den sich das Modell stützt. Beide Seiten sind auf 100 % ihrer selbst normiert.
 */
export function ShareCompareTable({
  rows,
  modelLabel,
  emptyHint
}: ShareCompareTableProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const ownColor = seriesPalette(isDark)[0]
  const modelColor = mutedColor(isDark)

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{emptyHint}</p>
    )
  }

  const max = rows.reduce((highest, row) => Math.max(highest, row.ownShare, row.modelShare), 0)

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
        <tr>
          <th className="px-2 py-1.5 font-medium">&nbsp;</th>
          <th className="px-2 py-1.5 font-medium" style={{ width: '38%' }}>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full" style={{ backgroundColor: ownColor }} />
              Dein Depot
            </span>
          </th>
          <th className="px-2 py-1.5 font-medium" style={{ width: '38%' }}>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full" style={{ backgroundColor: modelColor }} />
              {modelLabel}
            </span>
          </th>
          <th className="px-2 py-1.5 text-right font-medium">Abweichung</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-slate-100 dark:border-slate-800">
            <td className="px-2 py-1.5 text-slate-900 dark:text-slate-100">{row.label}</td>
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${max > 0 ? (row.ownShare / max) * 100 : 0}%`,
                      backgroundColor: ownColor
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs text-slate-600 dark:text-slate-300">
                  {formatShare(row.ownShare)}
                </span>
              </div>
            </td>
            <td className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${max > 0 ? (row.modelShare / max) * 100 : 0}%`,
                      backgroundColor: modelColor
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                  {formatShare(row.modelShare)}
                </span>
              </div>
            </td>
            <td className={`px-2 py-1.5 text-right ${deltaClass(row.deltaPp)}`}>
              {formatPercent(row.deltaPp)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
