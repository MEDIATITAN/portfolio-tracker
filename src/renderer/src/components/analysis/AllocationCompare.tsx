import {
  ALLOCATION_BUCKET_LABELS,
  type AllocationComparison,
  type AllocationRow
} from '@shared/allocationCalc'
import { formatEur, formatPercent, formatShare } from '../../lib/format'
import { mutedColor, seriesPalette } from '../../lib/chartColors'
import { useTheme } from '../../lib/ThemeContext'

interface AllocationCompareProps {
  comparison: AllocationComparison
  modelLabel: string
}

/** Ab dieser Abweichung ist ein Topf farblich hervorgehoben - darunter ist es Rauschen. */
const NOTABLE_PP = 5

function deltaClass(deltaPp: number): string {
  if (Math.abs(deltaPp) < NOTABLE_PP) return 'text-slate-500 dark:text-slate-400'
  return deltaPp > 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-amber-600 dark:text-amber-400'
}

function Bar({
  share,
  color,
  max
}: {
  share: number
  color: string
  max: number
}): React.JSX.Element {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className="h-full rounded-full"
        style={{ width: `${max > 0 ? (share / max) * 100 : 0}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function AllocationCompare({
  comparison,
  modelLabel
}: AllocationCompareProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const ownColor = seriesPalette(isDark)[0]
  const modelColor = mutedColor(isDark)

  // Beide Balken teilen sich denselben Maßstab, sonst sähe ein 8-%-Topf so breit aus wie ein
  // 70-%-Topf und der Vergleich wäre wertlos.
  // Töpfe, die auf beiden Seiten leer sind, sagen nichts - sie wären nur Zeilen mit zwei Nullen.
  const rows = comparison.rows.filter((row) => row.ownShare > 0 || row.modelShare > 0)

  const max = rows.reduce(
    (highest: number, row: AllocationRow) => Math.max(highest, row.ownShare, row.modelShare),
    0
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ backgroundColor: ownColor }} />
          Dein Depot
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full" style={{ backgroundColor: modelColor }} />
          {modelLabel}
        </span>
        <span className="ml-auto">Bezugsgröße: {formatEur(comparison.total)}</span>
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.bucket} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
            <span className="text-sm text-slate-900 dark:text-slate-100">
              {ALLOCATION_BUCKET_LABELS[row.bucket]}
            </span>
            <span className={`text-sm font-medium ${deltaClass(row.deltaPp)}`}>
              {formatPercent(row.deltaPp)}
              <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">
                pp
              </span>
            </span>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Bar share={row.ownShare} color={ownColor} max={max} />
                <span className="w-14 shrink-0 text-right text-xs text-slate-600 dark:text-slate-300">
                  {formatShare(row.ownShare)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Bar share={row.modelShare} color={modelColor} max={max} />
                <span className="w-14 shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                  {formatShare(row.modelShare)}
                </span>
              </div>
            </div>

            <span
              className="text-right text-xs text-slate-500 dark:text-slate-400"
              title="So viel müsstest du umschichten, um auf die Modellgewichte zu kommen: + bedeutet zukaufen, − abbauen."
            >
              {Math.abs(row.deltaEur) < 1
                ? '–'
                : `${row.deltaEur > 0 ? '+' : '−'}${formatEur(Math.abs(row.deltaEur))}`}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        &bdquo;pp&ldquo; sind Prozentpunkte: dein Anteil minus der Modellanteil. Die Euro-Spalte
        rechts sagt, was das in deinem Depot bedeutet – wie viel in diesem Topf fehlt (+) oder zu
        viel liegt (−), gemessen an der Bezugsgröße.
      </p>
    </div>
  )
}
