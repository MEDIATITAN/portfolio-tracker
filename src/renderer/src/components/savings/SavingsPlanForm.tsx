import { useState } from 'react'
import type { BudgetPeriod, NewSavingsPlan, Position, SavingsPlan } from '@shared/types'
import { PERIOD_LABELS, PERIOD_ORDER } from '@shared/budget'
import { CURRENCY_ORDER, SUPPORTED_CURRENCIES } from '@shared/currencies'
import { inputClass, labelClass } from '../positions/formStyles'

interface SavingsPlanFormProps {
  initial?: SavingsPlan | null
  /** Wertpapiere, in die ein Sparplan laufen kann. */
  positions: Position[]
  onSubmit: (input: NewSavingsPlan) => void
  onCancel: () => void
  submitting: boolean
}

/** Höchster Ausführungstag: den 29. bis 31. gibt es nicht in jedem Monat (siehe Schema). */
const MAX_EXECUTION_DAY = 28

function emptyForm(positions: Position[]): NewSavingsPlan {
  return {
    positionId: positions[0]?.id ?? 0,
    amount: 100,
    currency: 'EUR',
    period: 'MONTHLY',
    executionDay: 1,
    executionTime: null,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    active: true,
    notes: null
  }
}

function toNewPlan(plan: SavingsPlan): NewSavingsPlan {
  return {
    positionId: plan.positionId,
    amount: plan.amount,
    currency: plan.currency,
    period: plan.period,
    executionDay: plan.executionDay,
    executionTime: plan.executionTime,
    startDate: plan.startDate,
    endDate: plan.endDate,
    active: plan.active,
    notes: plan.notes
  }
}

export function SavingsPlanForm({
  initial,
  positions,
  onSubmit,
  onCancel,
  submitting
}: SavingsPlanFormProps): React.JSX.Element {
  const [form, setForm] = useState<NewSavingsPlan>(
    initial ? toNewPlan(initial) : emptyForm(positions)
  )

  function update<K extends keyof NewSavingsPlan>(key: K, value: NewSavingsPlan[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!form.positionId || form.amount <= 0) return
    onSubmit(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <label className={`${labelClass} col-span-2`}>
        Wertpapier
        <select
          className={inputClass}
          value={form.positionId}
          onChange={(e) => update('positionId', Number(e.target.value))}
          required
        >
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.symbol ? ` (${p.symbol})` : ''}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          Nur Positionen mit Kurs - ein Sparplan braucht einen Preis, um die Stückzahl auszurechnen.
        </span>
      </label>

      <label className={labelClass}>
        Betrag je Ausführung
        <input
          type="number"
          step="any"
          min="0"
          className={inputClass}
          value={form.amount}
          onChange={(e) => update('amount', Number(e.target.value))}
          required
        />
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
      </label>

      <label className={labelClass}>
        Ausführungstag
        <input
          type="number"
          min="1"
          max={MAX_EXECUTION_DAY}
          className={inputClass}
          value={form.executionDay}
          onChange={(e) =>
            update(
              'executionDay',
              Math.min(MAX_EXECUTION_DAY, Math.max(1, Math.round(Number(e.target.value))))
            )
          }
          required
        />
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          1 bis {MAX_EXECUTION_DAY} - den 29. bis 31. hat nicht jeder Monat.
        </span>
      </label>

      <label className={labelClass}>
        Uhrzeit (optional)
        <input
          type="time"
          className={inputClass}
          value={form.executionTime ?? ''}
          onChange={(e) => update('executionTime', e.target.value || null)}
        />
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          Genauer wird es nur bei frischen Ausführungen: Stundenkurse liegen für die letzten acht
          Tage vor, ältere bekommen so oder so den Tagesschlusskurs. Gesetzt, wird heute erst nach
          dieser Uhrzeit gebucht.
        </span>
      </label>

      <label className={labelClass}>
        Erste Ausführung ab
        <input
          type="date"
          className={inputClass}
          value={form.startDate}
          onChange={(e) => update('startDate', e.target.value)}
          required
        />
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          Liegt der Beginn in der Vergangenheit, werden die Ausführungen bis heute nachgebucht.
        </span>
      </label>

      <label className={labelClass}>
        Letzte Ausführung bis (optional)
        <input
          type="date"
          className={inputClass}
          value={form.endDate ?? ''}
          onChange={(e) => update('endDate', e.target.value || null)}
        />
        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
          Leer lassen, wenn der Plan unbefristet läuft.
        </span>
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
        Läuft aktuell
        <span className="text-xs text-slate-500 dark:text-slate-400">
          (abschalten statt löschen, wenn ein Plan nur pausiert - gebuchte Ausführungen bleiben)
        </span>
      </label>

      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={submitting || positions.length === 0}
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
