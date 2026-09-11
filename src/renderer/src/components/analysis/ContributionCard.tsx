import { formatDate, formatEur } from '../../lib/format'

export interface AlternativeOutcome {
  key: string
  label: string
  finalValue: number
}

interface ContributionCardProps {
  /** Startwert plus alle späteren Einzahlungen, abzüglich Entnahmen. */
  netInvested: number
  portfolioValue: number
  alternatives: AlternativeOutcome[]
  fromDate: string
}

export function ContributionCard({
  netInvested,
  portfolioValue,
  alternatives,
  fromDate
}: ContributionCardProps): React.JSX.Element {
  const sorted = [...alternatives].sort((a, b) => b.finalValue - a.finalValue)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Dieselben Einzahlungen anderswo
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Startwert am {formatDate(fromDate)} und jede spätere Ein- oder Auszahlung, taggenau in den
        jeweiligen Vergleichsmaßstab gesteckt statt in die eigene Auswahl.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Netto eingesetzt</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatEur(netInvested)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dein Depot heute</p>
          <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {formatEur(portfolioValue)}
          </p>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
        {sorted.map((alt) => {
          const diff = portfolioValue - alt.finalValue
          return (
            <li key={alt.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-600 dark:text-slate-300">{alt.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-slate-900 dark:text-slate-100">
                  {formatEur(alt.finalValue)}
                </span>
                <span
                  className={`w-28 text-right text-xs ${
                    diff >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {diff >= 0 ? '+' : '−'}
                  {formatEur(Math.abs(diff))}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
        Grün heißt: dein Depot steht heute um diesen Betrag besser da.
      </p>
    </div>
  )
}
