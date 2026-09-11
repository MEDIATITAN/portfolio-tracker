import { useState } from 'react'
import type {
  BudgetItem,
  BudgetItemType,
  BudgetPeriod,
  NewBudgetItem,
  Position
} from '@shared/types'
import { PERIOD_LABELS, PERIOD_ORDER } from '@shared/budget'
import { CURRENCY_ORDER, SUPPORTED_CURRENCIES } from '@shared/currencies'
import { inputClass, labelClass } from '../positions/formStyles'

interface BudgetFormProps {
  initial?: BudgetItem | null
  /** Konten, auf die gebucht werden kann - nur Guthaben haben einen Kontostand. */
  accounts: Position[]
  onSubmit: (input: NewBudgetItem) => void
  onCancel: () => void
  submitting: boolean
}

const TYPE_LABELS: Record<BudgetItemType, string> = {
  INCOME: 'Einnahme',
  EXPENSE: 'Fixkosten'
}

/** Vorschläge, keine feste Liste - eigene Kategorien bleiben möglich. */
const CATEGORY_SUGGESTIONS: Record<BudgetItemType, string[]> = {
  INCOME: ['Gehalt', 'Nebenjob', 'Miete', 'Dividenden', 'Sonstiges'],
  EXPENSE: [
    'Wohnen',
    'Versicherung',
    'Mobilität',
    'Sport',
    'Telekommunikation',
    'Abos',
    'Lebensmittel',
    'Sparplan',
    'Sonstiges'
  ]
}

function emptyForm(): NewBudgetItem {
  return {
    type: 'EXPENSE',
    name: '',
    amount: 0,
    currency: 'EUR',
    period: 'MONTHLY',
    category: null,
    accountPositionId: null,
    active: true,
    notes: null
  }
}

function toNewItem(item: BudgetItem): NewBudgetItem {
  return {
    type: item.type,
    name: item.name,
    amount: item.amount,
    currency: item.currency,
    period: item.period,
    category: item.category,
    accountPositionId: item.accountPositionId,
    active: item.active,
    notes: item.notes
  }
}

export function BudgetForm({
  initial,
  accounts,
  onSubmit,
  onCancel,
  submitting
}: BudgetFormProps): React.JSX.Element {
  const [form, setForm] = useState<NewBudgetItem>(initial ? toNewItem(initial) : emptyForm())

  function update<K extends keyof NewBudgetItem>(key: K, value: NewBudgetItem[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!form.name.trim()) return
    onSubmit({ ...form, name: form.name.trim() })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <label className={labelClass}>
        Art
        <select
          className={inputClass}
          value={form.type}
          onChange={(e) => update('type', e.target.value as BudgetItemType)}
        >
          {(['INCOME', 'EXPENSE'] as BudgetItemType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Bezeichnung
        <input
          className={inputClass}
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder={form.type === 'INCOME' ? 'z.B. Gehalt' : 'z.B. Miete'}
          required
        />
      </label>

      <label className={labelClass}>
        Betrag je Zahlung
        <input
          type="number"
          step="any"
          className={inputClass}
          value={form.amount}
          onChange={(e) => update('amount', Number(e.target.value))}
          required
        />
      </label>

      <label className={labelClass}>
        Rhythmus
        <select
          className={inputClass}
          value={form.period}
          onChange={(e) => update('period', e.target.value as BudgetPeriod)}
        >
          {PERIOD_ORDER.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABELS[p]}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          Der Betrag wird für die Übersicht auf einen Monat heruntergerechnet.
        </span>
      </label>

      <label className={labelClass}>
        Kategorie
        <input
          className={inputClass}
          value={form.category ?? ''}
          onChange={(e) => update('category', e.target.value.trim() || null)}
          list="budget-categories"
          placeholder="optional"
        />
        <datalist id="budget-categories">
          {CATEGORY_SUGGESTIONS[form.type].map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className={labelClass}>
        Konto
        <select
          className={inputClass}
          value={form.accountPositionId ?? ''}
          onChange={(e) =>
            update('accountPositionId', e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">– keins –</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          {form.accountPositionId === null
            ? 'Ohne Konto wird nur gerechnet, kein Kontostand verändert.'
            : form.type === 'INCOME'
              ? 'Wird jeden Monat auf diesen Kontostand aufgeschlagen, ab dem laufenden Monat.'
              : 'Wird jeden Monat von diesem Kontostand abgezogen, ab dem laufenden Monat.'}
        </span>
      </label>

      <label className={labelClass}>
        Währung
        <select
          className={inputClass}
          value={form.currency}
          onChange={(e) => update('currency', e.target.value)}
          required
        >
          {CURRENCY_ORDER.map((code) => (
            <option key={code} value={code}>
              {code} – {SUPPORTED_CURRENCIES[code]}
            </option>
          ))}
        </select>
      </label>

      <label className={`${labelClass} col-span-2`}>
        Notiz
        <input
          className={inputClass}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value.trim() || null)}
          placeholder="optional"
        />
      </label>

      <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => update('active', e.target.checked)}
        />
        Zählt aktuell mit
        <span className="text-xs text-slate-500 dark:text-slate-400">
          (abschalten statt löschen, wenn ein Posten nur pausiert)
        </span>
      </label>

      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {initial ? 'Speichern' : 'Hinzufügen'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Abbrechen
        </button>
      </div>
    </form>
  )
}
