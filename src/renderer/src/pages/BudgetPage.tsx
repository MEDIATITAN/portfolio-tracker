import { useRef, useState } from 'react'
import type { BudgetItem, BudgetItemType, FxRate, NewBudgetItem } from '@shared/types'
import { PERIOD_LABELS, monthlyAmount } from '@shared/budget'
import { findFxRate } from '@shared/valueCalc'
import { BudgetForm } from '../components/budget/BudgetForm'
import { BreakdownDonut } from '../components/dashboard/BreakdownDonut'
import { createSliceAccumulator, type Slice } from '../lib/selectors'
import { formatEur, formatMoney } from '../lib/format'
import {
  useBudgetItems,
  useCreateBudgetItem,
  useDeleteBudgetItem,
  useFxRates,
  useUpdateBudgetItem
} from '../lib/queries'

const TYPE_TITLES: Record<BudgetItemType, string> = {
  INCOME: 'Einnahmen',
  EXPENSE: 'Fixkosten'
}

/**
 * Monatsbetrag eines Postens in Euro, oder null wenn der Wechselkurs fehlt.
 *
 * Bewusst getrennt vom Betrag selbst: gespeichert wird, was tatsächlich abgebucht wird (eine
 * Jahresversicherung als Jahresbetrag). Erst hier wird daraus die Monatsgröße, mit der sich
 * Einnahmen und Ausgaben überhaupt vergleichen lassen.
 */
function monthlyEur(item: BudgetItem, fxRates: FxRate[]): number | null {
  const rate = findFxRate(fxRates, item.currency, 'EUR')
  if (rate === null) return null
  return monthlyAmount(item) * rate
}

/** Posten ohne eigene Kategorie - bewusst als eigene Scheibe statt stillschweigend weggelassen. */
const NO_CATEGORY_LABEL = 'Ohne Kategorie'

/**
 * Größter Posten zuerst. Verglichen wird der Monatsbetrag in Euro, nicht der gespeicherte Betrag:
 * eine Jahresversicherung über 400 € ist monatlich kleiner als eine Miete über 900 €. Posten ohne
 * Wechselkurs lassen sich nicht einordnen und wandern ans Ende.
 *
 * Pausierte Posten stehen grundsätzlich hinten, egal wie groß sie sind: sie zählen weder in den
 * Kacheln noch im Diagramm mit - oben soll stehen, was tatsächlich ins Gewicht fällt.
 */
function sortBySize(items: BudgetItem[], fxRates: FxRate[]): BudgetItem[] {
  return [...items].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const av = monthlyEur(a, fxRates)
    const bv = monthlyEur(b, fxRates)
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1
    return bv - av
  })
}

/**
 * Monatsbeträge je Kategorie, für das Diagramm unter der jeweiligen Tabelle.
 *
 * Pausierte Posten bleiben außen vor - genau wie in den Summen darüber. Sonst zeigte der Ring einen
 * anderen Gesamtbetrag als die Kachel daneben.
 */
function categorySlices(items: BudgetItem[], fxRates: FxRate[]): Slice[] {
  const acc = createSliceAccumulator()
  for (const item of items) {
    if (!item.active) continue
    const value = monthlyEur(item, fxRates)
    if (value === null) continue
    acc.add(item.category ?? NO_CATEGORY_LABEL, item.name, value)
  }
  return acc.toSlices()
}

function SummaryCard({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'income' | 'expense' | 'result'
}): React.JSX.Element {
  const color =
    tone === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'expense'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="flex-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function ItemTable({
  title,
  items,
  fxRates,
  onEdit,
  onDelete,
  onToggleActive
}: {
  title: string
  items: BudgetItem[]
  fxRates: FxRate[]
  onEdit: (item: BudgetItem) => void
  onDelete: (item: BudgetItem) => void
  onToggleActive: (item: BudgetItem) => void
}): React.JSX.Element {
  const sorted = sortBySize(items, fxRates)
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">
          Noch nichts eingetragen.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 dark:text-slate-400">
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-2 font-medium">Bezeichnung</th>
              <th className="px-3 py-2 font-medium">Rhythmus</th>
              <th className="px-3 py-2 text-right font-medium">Betrag</th>
              <th className="px-3 py-2 text-right font-medium">pro Monat</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="text-slate-800 dark:text-slate-200">
            {sorted.map((item) => {
              const perMonth = monthlyEur(item, fxRates)
              // Grün, was reinkommt, rot, was rausgeht - dieselbe Zuordnung wie in den
              // Kacheln darüber und im Rest der Anwendung.
              const amountColor =
                item.type === 'INCOME'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400'
              return (
                <tr
                  key={item.id}
                  className={`border-t border-slate-100 dark:border-slate-800 ${
                    item.active ? '' : 'opacity-45'
                  }`}
                >
                  <td className="px-4 py-2">
                    {item.name}
                    {item.category && (
                      <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                        {item.category}
                      </span>
                    )}
                    {!item.active && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        pausiert
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                    {PERIOD_LABELS[item.period]}
                  </td>
                  <td className={`px-3 py-2 text-right ${amountColor}`}>
                    {formatMoney(item.amount, item.currency)}
                  </td>
                  <td className={`px-3 py-2 text-right font-medium ${amountColor}`}>
                    {perMonth === null ? '–' : formatEur(perMonth)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onToggleActive(item)}
                      title={item.active ? 'Pausieren' : 'Wieder mitzählen'}
                      className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      {item.active ? '⏸' : '▶'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="ml-1 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
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
      )}
    </div>
  )
}

export function BudgetPage(): React.JSX.Element {
  const { data: items } = useBudgetItems()
  const { data: fxRates } = useFxRates()
  const createItem = useCreateBudgetItem()
  const updateItem = useUpdateBudgetItem()
  const deleteItem = useDeleteBudgetItem()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BudgetItem | null>(null)
  const [expandedChart, setExpandedChart] = useState<BudgetItemType | null>(null)
  // Wie im Dashboard: nur ein einziger Platz für die Detailansicht, damit nie zwei Diagramme
  // gleichzeitig aufgeschlüsselt sind.
  const [drill, setDrill] = useState<{ type: BudgetItemType; label: string } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  const all = items ?? []
  const rates = fxRates ?? []
  // Pausierte Posten zählen nicht mit - sie bleiben nur als Merkposten in der Liste stehen.
  const counted = all.filter((i) => i.active)
  const sum = (type: BudgetItemType): number =>
    counted
      .filter((i) => i.type === type)
      .reduce((total, i) => total + (monthlyEur(i, rates) ?? 0), 0)

  const income = sum('INCOME')
  const expenses = sum('EXPENSE')
  const balance = income - expenses
  const savingsRate = income > 0 ? (balance / income) * 100 : null

  function closeForm(): void {
    setShowForm(false)
    setEditing(null)
  }

  function handleSubmit(input: NewBudgetItem): void {
    if (editing) updateItem.mutate({ ...input, id: editing.id }, { onSuccess: closeForm })
    else createItem.mutate(input, { onSuccess: closeForm })
  }

  function handleEdit(item: BudgetItem): void {
    setEditing(item)
    setShowForm(true)
    // Wie bei den Positionen: das Formular steht oben, ohne Sprung sähe man den Klick nicht wirken.
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }))
  }

  function handleDelete(item: BudgetItem): void {
    if (!confirm(`"${item.name}" wirklich löschen?`)) return
    deleteItem.mutate(item.id)
  }

  function table(type: BudgetItemType): React.JSX.Element {
    return (
      <ItemTable
        title={TYPE_TITLES[type]}
        items={all.filter((i) => i.type === type)}
        fxRates={rates}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleActive={(item) => updateItem.mutate({ id: item.id, active: !item.active })}
      />
    )
  }

  /** Kategorien-Diagramm einer Seite, oder null wenn es dort nichts zu zeigen gibt. */
  function donut(type: BudgetItemType): React.JSX.Element | null {
    const slices = categorySlices(
      all.filter((i) => i.type === type),
      rates
    )
    // Ohne Posten gäbe es nur einen leeren Ring - dann bleibt die Karte ganz weg.
    if (slices.length === 0) return null
    return (
      <div key={type} className="min-w-0 flex-1">
        <BreakdownDonut
          title={`${TYPE_TITLES[type]} nach Kategorie`}
          data={slices}
          headerExtra={
            <span className="text-xs text-slate-400 dark:text-slate-500">pro Monat</span>
          }
          expanded={expandedChart === type}
          onToggleExpand={() => setExpandedChart((prev) => (prev === type ? null : type))}
          drillLabel={drill?.type === type ? drill.label : null}
          onDrillChange={(label) => setDrill(label === null ? null : { type, label })}
        />
      </div>
    )
  }

  const donuts = [donut('INCOME'), donut('EXPENSE')]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Einnahmen &amp; Ausgaben
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Was jeden Monat rein- und rausgeht
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            + Posten hinzufügen
          </button>
        )}
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        <SummaryCard label="Einnahmen im Monat" value={formatEur(income)} tone="income" />
        <SummaryCard label="Fixkosten im Monat" value={formatEur(expenses)} tone="expense" />
        <SummaryCard
          label={balance < 0 ? 'Monatliche Unterdeckung' : 'Bleibt übrig'}
          value={formatEur(balance)}
          tone={balance < 0 ? 'expense' : 'income'}
        />
      </div>

      {savingsRate !== null && (
        <p className="-mt-3 text-xs text-slate-500 dark:text-slate-400">
          Das sind {savingsRate.toFixed(1)} % deiner Einnahmen.
          {balance > 0 && ' Diese Summe steht dir monatlich zum Anlegen oder Sparen zur Verfügung.'}
        </p>
      )}

      {showForm && (
        <div ref={formRef}>
          {/* Der key erzwingt ein frisches Formular beim Wechsel zwischen Anlegen und
              Bearbeiten - sonst bliebe der vorige Inhalt stehen. */}
          <BudgetForm
            key={editing?.id ?? 'new'}
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            submitting={createItem.isPending || updateItem.isPending}
          />
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        {table('INCOME')}
        {table('EXPENSE')}
      </div>

      {/* Die Diagramme stehen bewusst in einer eigenen Reihe und nicht direkt unter ihrer Tabelle:
          nur so sind beide gleich hoch und fangen auf derselben Linie an - die Tabellen darüber
          haben je nach Anzahl der Posten ganz unterschiedliche Höhen. */}
      {donuts.some((d) => d !== null) && (
        <div className="flex flex-col gap-4 lg:flex-row">{donuts}</div>
      )}
    </div>
  )
}
