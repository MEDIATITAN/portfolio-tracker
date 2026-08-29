import { formatEur, formatPercent } from '../../lib/format'

interface NetWorthCardProps {
  title: string
  totalEur: number
  gainLossEur: number
  gainLossPercent: number | null
}

export function NetWorthCard({ title, totalEur, gainLossEur, gainLossPercent }: NetWorthCardProps): React.JSX.Element {
  const isNegative = gainLossPercent !== null && gainLossPercent < 0
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{formatEur(totalEur)}</p>
        {gainLossPercent !== null && (
          <p className={`text-sm font-medium ${isNegative ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {formatPercent(gainLossPercent)} ({formatEur(gainLossEur)})
          </p>
        )}
      </div>
      {gainLossPercent === null && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Rendite noch nicht berechenbar – trag bei mindestens einer Position einen Einstandspreis ein.
        </p>
      )}
    </div>
  )
}
