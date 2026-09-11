import { useRef, useState } from 'react'
import type { FxRate, NewSavingsPlan, Position, SavingsPlanWithStats } from '@shared/types'
import { PERIOD_LABELS, monthlyAmount } from '@shared/budget'
import { computeAllPositionValues, findFxRate } from '@shared/valueCalc'
import { SavingsPlanForm } from '../components/savings/SavingsPlanForm'
import { SavingsCalculator } from '../components/savings/SavingsCalculator'
import { formatDate, formatEur, formatMoney, formatNumber, formatPercent } from '../lib/format'
import {
  useCreateSavingsPlan,
  useDeleteSavingsPlan,
  useFxRates,
  usePositions,
  usePriceCache,
  useSavingsPlans,
  useUpdateSavingsPlan
} from '../lib/queries'

/**
 * Monatlicher Aufwand eines Plans in Euro, oder null wenn der Wechselkurs fehlt. Gerechnet wie im
 * Budget: der Betrag je Ausführung, heruntergebrochen auf einen Monat.
 */
function monthlyEur(plan: SavingsPlanWithStats, fxRates: FxRate[]): number | null {
  const rate = findFxRate(fxRates, plan.currency, 'EUR')
  if (rate === null) return null
  return monthlyAmount(plan) * rate
}

function SummaryCard({
  label,
  value,
  hint
}: {
  label: string
  value: string
  hint?: string
}): React.JSX.Element {
  return (
    <div className="flex-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

export function SavingsPlansPage(): React.JSX.Element {
  const { data: plans } = useSavingsPlans()
  const { data: positions } = usePositions()
  const { data: fxRates } = useFxRates()
  const { data: priceCache } = usePriceCache()
  const createPlan = useCreateSavingsPlan()
  const updatePlan = useUpdateSavingsPlan()
  const deletePlan = useDeleteSavingsPlan()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SavingsPlanWithStats | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const all = plans ?? []
  const rates = fxRates ?? []
  // Ein Sparplan kauft ein Wertpapier - Guthaben und Bargeld haben keinen Kurs, aus dem sich eine
  // Stückzahl ergäbe, und stehen deshalb nicht zur Auswahl.
  const eligible = (positions ?? []).filter(
    (p: Position) => p.assetClass !== 'CASH_OTHER' && p.identifier !== null
  )

  const values = computeAllPositionValues(positions ?? [], priceCache ?? [], rates)
  const priceEurByPosition = new Map(values.map((v) => [v.position.id, v.priceEur]))

  // Größter Plan zuerst, pausierte ans Ende - dieselbe Ordnung wie bei Einnahmen & Ausgaben.
  const sorted = [...all].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    return (monthlyEur(b, rates) ?? 0) - (monthlyEur(a, rates) ?? 0)
  })

  const monthlyTotal = all
    .filter((p) => p.active)
    .reduce((sum, p) => sum + (monthlyEur(p, rates) ?? 0), 0)
  const investedTotal = all.reduce((sum, p) => {
    const rate = findFxRate(rates, p.currency, 'EUR')
    return sum + (rate === null ? 0 : p.investedTotal * rate)
  }, 0)
  const currentTotal = all.reduce((sum, p) => {
    const priceEur = priceEurByPosition.get(p.positionId) ?? null
    return sum + (priceEur === null ? 0 : p.quantityTotal * priceEur)
  }, 0)

  function closeForm(): void {
    setShowForm(false)
    setEditing(null)
  }

  function handleSubmit(input: NewSavingsPlan): void {
    if (editing) updatePlan.mutate({ ...input, id: editing.id }, { onSuccess: closeForm })
    else createPlan.mutate(input, { onSuccess: closeForm })
  }

  function handleEdit(plan: SavingsPlanWithStats): void {
    setEditing(plan)
    setShowForm(true)
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  function handleDelete(plan: SavingsPlanWithStats): void {
    if (
      !confirm(
        `Sparplan auf "${plan.positionName}" wirklich löschen?\n\nDie bereits gebuchten ${plan.executions} Ausführung(en) bleiben im Depot stehen.`
      )
    )
      return
    deletePlan.mutate(plan.id)
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Sparpläne</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Was regelmäßig automatisch gekauft wird
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            disabled={eligible.length === 0}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            + Sparplan hinzufügen
          </button>
        )}
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        <SummaryCard label="Monatlich" value={formatEur(monthlyTotal)} />
        <SummaryCard
          label="Bisher eingezahlt"
          value={formatEur(investedTotal)}
          hint="Summe aller gebuchten Ausführungen"
        />
        <SummaryCard
          label="Heutiger Wert"
          value={formatEur(currentTotal)}
          hint={
            investedTotal > 0
              ? `${formatEur(currentTotal - investedTotal)} (${formatPercent(
                  ((currentTotal - investedTotal) / investedTotal) * 100
                )})`
              : undefined
          }
        />
      </div>

      {showForm && (
        <div ref={formRef}>
          <SavingsPlanForm
            key={editing?.id ?? 'new'}
            initial={editing}
            positions={eligible}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            submitting={createPlan.isPending || updatePlan.isPending}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {sorted.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">
            {eligible.length === 0
              ? 'Noch kein Wertpapier im Depot, in das ein Sparplan laufen könnte.'
              : 'Noch kein Sparplan angelegt.'}
          </p>
        ) : (
          <div className="scroll-subtle overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-2 font-medium">Wertpapier</th>
                  <th className="px-3 py-2 text-right font-medium">Betrag</th>
                  <th className="px-3 py-2 font-medium">Rhythmus</th>
                  <th className="px-3 py-2 font-medium">Nächste</th>
                  <th className="px-3 py-2 text-right font-medium">Ausführungen</th>
                  <th className="px-3 py-2 text-right font-medium">Eingezahlt</th>
                  <th className="px-3 py-2 text-right font-medium">Wert heute</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="text-slate-800 dark:text-slate-200">
                {sorted.map((plan) => {
                  const rate = findFxRate(rates, plan.currency, 'EUR')
                  const investedEur = rate === null ? null : plan.investedTotal * rate
                  const priceEur = priceEurByPosition.get(plan.positionId) ?? null
                  const valueEur = priceEur === null ? null : plan.quantityTotal * priceEur
                  const gain =
                    investedEur !== null && valueEur !== null && investedEur > 0
                      ? ((valueEur - investedEur) / investedEur) * 100
                      : null
                  return (
                    <tr
                      key={plan.id}
                      className={`border-t border-slate-100 dark:border-slate-800 ${
                        plan.active ? '' : 'opacity-45'
                      }`}
                    >
                      <td className="px-4 py-2">
                        {plan.positionName}
                        {!plan.active && (
                          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            pausiert
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {formatMoney(plan.amount, plan.currency)}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {PERIOD_LABELS[plan.period]}, am {plan.executionDay}.
                        {plan.executionTime !== null && ` um ${plan.executionTime} Uhr`}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {plan.nextExecution === null ? '–' : formatDate(plan.nextExecution)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {plan.executions}
                        {plan.quantityTotal > 0 && (
                          <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">
                            ({formatNumber(plan.quantityTotal)} St.)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {investedEur === null ? '–' : formatEur(investedEur)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {valueEur === null ? '–' : formatEur(valueEur)}
                        {gain !== null && (
                          <span
                            className={`ml-2 text-xs ${
                              gain >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {formatPercent(gain)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => updatePlan.mutate({ id: plan.id, active: !plan.active })}
                          title={plan.active ? 'Pausieren' : 'Wieder laufen lassen'}
                          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          {plan.active ? '⏸' : '▶'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(plan)}
                          className="ml-1 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(plan)}
                          title="Löschen"
                          className="ml-1 rounded px-1.5 py-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:text-slate-500 dark:hover:bg-red-950 dark:hover:text-red-400"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SavingsCalculator
        monthlyFromPlans={monthlyTotal > 0 ? monthlyTotal : null}
        valueFromPlans={currentTotal > 0 ? currentTotal : null}
      />

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Jede fällige Ausführung wird beim Kursabruf als Kauf gebucht, mit dem Kurs des
        Ausführungstages. Trifft später die echte Abrechnung deines Brokers per CSV ein, ersetzt sie
        die vorgemerkte Buchung desselben Monats - der Bestand wird also nicht doppelt gezählt.
      </p>
    </div>
  )
}
