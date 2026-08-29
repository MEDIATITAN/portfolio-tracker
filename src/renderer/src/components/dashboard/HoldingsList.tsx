import type { PositionValue } from '@shared/valueCalc'
import { ASSET_CLASS_LABELS, formatEur } from '../../lib/format'

interface HoldingsListProps {
  values: PositionValue[]
}

export function HoldingsList({ values }: HoldingsListProps): React.JSX.Element {
  const withValue = values.filter((v) => v.valueEur !== null && v.valueEur > 0)
  const total = withValue.reduce((sum, v) => sum + (v.valueEur ?? 0), 0)
  const sorted = [...withValue].sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0))

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Vermögenswerte</h3>
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          Noch keine bewerteten Positionen.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sorted.map((v) => {
            const percent = total > 0 ? ((v.valueEur ?? 0) / total) * 100 : 0
            return (
              <li key={v.position.id} className="relative overflow-hidden rounded">
                <div
                  className="absolute inset-y-0 left-0 bg-blue-50 dark:bg-blue-500/10"
                  style={{ width: `${percent}%` }}
                />
                <div className="relative flex items-center justify-between gap-3 px-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">{v.position.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {ASSET_CLASS_LABELS[v.position.assetClass]}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{formatEur(v.valueEur)}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{percent.toFixed(1)} %</p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
