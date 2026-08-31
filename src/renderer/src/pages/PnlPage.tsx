import { useState } from 'react'
import { computeAllPositionValues, totalGainLoss } from '@shared/valueCalc'
import { computeRealizedSales, summarizeRealized } from '../lib/realizedGains'
import { formatDate, formatEur, formatNumber, formatPercent } from '../lib/format'
import { useFxRates, usePositions, usePriceCache, useTransactions } from '../lib/queries'

type SortMode = 'date' | 'worst' | 'best'

const SORT_LABELS: Record<SortMode, string> = {
  date: 'Neueste zuerst',
  worst: 'Größter Verlust',
  best: 'Größter Gewinn'
}

const ALL_YEARS = 'ALL'

function StatCard({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral'
}): React.JSX.Element {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="flex-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  )
}

export function PnlPage(): React.JSX.Element {
  const { data: transactions } = useTransactions()
  const { data: positions } = usePositions()
  const { data: priceCache } = usePriceCache()
  const { data: fxRates } = useFxRates()

  const [sortMode, setSortMode] = useState<SortMode>('date')
  const [year, setYear] = useState<string>(ALL_YEARS)

  const allSales = computeRealizedSales(transactions ?? [], fxRates ?? [])
  const years = [...new Set(allSales.map((s) => s.date.slice(0, 4)))].sort((a, b) =>
    b.localeCompare(a)
  )

  const sales = year === ALL_YEARS ? allSales : allSales.filter((s) => s.date.startsWith(year))
  const realized = summarizeRealized(sales)

  // Unrealisiert = aktueller Bestand gegen Einstandspreis (identisch zur Kennzahl auf der Übersicht),
  // bewusst NICHT nach Jahr gefiltert - offene Positionen gehören keinem abgeschlossenen Jahr an.
  const values = computeAllPositionValues(positions ?? [], priceCache ?? [], fxRates ?? [])
  const unrealized = totalGainLoss(values)
  const combined = realized.gainLossEur + unrealized.gainLossEur

  const sorted = [...sales].sort((a, b) => {
    if (sortMode === 'worst') return a.gainLossEur - b.gainLossEur
    if (sortMode === 'best') return b.gainLossEur - a.gainLossEur
    return b.date.localeCompare(a.date) || b.transactionId - a.transactionId
  })

  const tone = (v: number): 'positive' | 'negative' | 'neutral' =>
    v > 0 ? 'positive' : v < 0 ? 'negative' : 'neutral'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Gewinn &amp; Verlust
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Realisierte Ergebnisse aus abgeschlossenen Verkäufen (FIFO)
          </p>
        </div>
        {/* Immer sichtbar, auch wenn es (noch) nur ein Jahr mit Verkäufen gibt - der Filter steuert
            die ganze Seite, deshalb steht er hier oben und nicht in der Tabelle. Aufgelistet werden
            die Jahre, in denen tatsächlich verkauft wurde; kommen später Verkäufe aus z.B. 2024
            dazu, erscheint das Jahr automatisch. */}
        <div className="flex shrink-0 flex-wrap gap-0.5">
          {[ALL_YEARS, ...years].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={`rounded px-3 py-1 text-xs font-medium ${
                year === y
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {y === ALL_YEARS ? 'Alle Jahre' : y}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-4 md:flex-row">
        <StatCard
          label={year === ALL_YEARS ? 'Realisiert (gesamt)' : `Realisiert ${year}`}
          value={formatEur(realized.gainLossEur)}
          sub={
            realized.percent !== null
              ? `${formatPercent(realized.percent)} auf ${formatEur(realized.costEur)} Einstand`
              : 'Noch keine Verkäufe'
          }
          tone={tone(realized.gainLossEur)}
        />
        <StatCard
          label="Unrealisiert (offene Positionen)"
          value={formatEur(unrealized.gainLossEur)}
          sub={
            unrealized.percent !== null
              ? formatPercent(unrealized.percent)
              : 'Kein Einstandspreis hinterlegt'
          }
          tone={tone(unrealized.gainLossEur)}
        />
        <StatCard
          label="Gesamt"
          value={formatEur(combined)}
          sub="Realisiert + unrealisiert"
          tone={tone(combined)}
        />
      </div>

      {allSales.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Noch keine Verkäufe erfasst. Sobald du eine Position ganz oder teilweise verkaufst (oder
          einen Broker-Export mit Verkäufen importierst), erscheint hier dein realisiertes Ergebnis.
        </p>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Verkäufe</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {realized.winners} im Plus · {realized.losers} im Minus
              </p>
            </div>
            <div className="flex gap-0.5">
              {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSortMode(m)}
                  className={`rounded px-2 py-0.5 text-xs ${
                    sortMode === m
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {SORT_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              Keine Verkäufe in {year}.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-2 py-2 font-medium">Datum</th>
                  <th className="px-2 py-2 font-medium">Position</th>
                  <th className="px-2 py-2 text-right font-medium">Menge</th>
                  <th className="px-2 py-2 text-right font-medium">Einstand</th>
                  <th className="px-2 py-2 text-right font-medium">Erlös</th>
                  <th className="px-2 py-2 text-right font-medium">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const negative = s.gainLossEur < 0
                  return (
                    <tr
                      key={s.transactionId}
                      className="border-b border-slate-50 text-slate-900 last:border-0 dark:border-slate-800/60 dark:text-slate-100"
                    >
                      <td className="px-2 py-2 whitespace-nowrap">{formatDate(s.date)}</td>
                      <td className="px-2 py-2">{s.positionName}</td>
                      <td className="px-2 py-2 text-right">{formatNumber(s.quantity)}</td>
                      <td className="px-2 py-2 text-right text-slate-500 dark:text-slate-400">
                        {formatEur(s.costEur)}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-500 dark:text-slate-400">
                        {formatEur(s.proceedsEur)}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-medium ${
                          negative
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatEur(s.gainLossEur)}
                        {s.percent !== null && (
                          <span className="block text-xs font-normal opacity-80">
                            {formatPercent(s.percent)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
