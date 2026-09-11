import { useState } from 'react'
import {
  BENCHMARK_COMPONENTS,
  BENCHMARK_UNIVERSES,
  COMPONENT_LABELS,
  type BenchmarkComponent,
  type BenchmarkUniverse,
  type BenchmarkWeights,
  type CustomBenchmarkModel,
  type NewCustomBenchmarkModel
} from '@shared/benchmarkCalc'
import { formatNumber } from '../../lib/format'
import { inputClass, labelClass } from '../positions/formStyles'

interface CustomModelFormProps {
  initial?: CustomBenchmarkModel | null
  /** Nur für die Beschriftung: welcher Fonds gerade hinter welchem Baustein steckt. */
  universe: BenchmarkUniverse
  onSubmit: (input: NewCustomBenchmarkModel) => void
  onCancel: () => void
  submitting: boolean
}

/** Gewichte im Formular als Text in Prozent - so lässt sich ein Feld auch vollständig leeren. */
type PercentForm = Record<BenchmarkComponent, string>

/** So weit darf die Summe von 100 % abweichen, bevor das Formular sie beanstandet. */
const SUM_TOLERANCE = 0.05

function emptyPercents(): PercentForm {
  return {
    EQUITY: '',
    EQUITY_WORLD: '',
    BOND_AGG: '',
    BOND_LONG: '',
    BOND_MID: '',
    GOLD: '',
    COMMODITY: '',
    CRYPTO: ''
  }
}

function toPercents(weights: BenchmarkWeights): PercentForm {
  const form = emptyPercents()
  for (const component of BENCHMARK_COMPONENTS) {
    const weight = weights[component] ?? 0
    if (weight > 0) form[component] = String(Math.round(weight * 1000) / 10)
  }
  return form
}

function parsePercent(value: string): number {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function sumOf(form: PercentForm): number {
  return BENCHMARK_COMPONENTS.reduce((sum, c) => sum + parsePercent(form[c]), 0)
}

export function CustomModelForm({
  initial,
  universe,
  onSubmit,
  onCancel,
  submitting
}: CustomModelFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '')
  const [percents, setPercents] = useState<PercentForm>(
    initial ? toPercents(initial.weights) : emptyPercents()
  )

  const sum = sumOf(percents)
  const sumOk = Math.abs(sum - 100) <= SUM_TOLERANCE
  const canSubmit = name.trim().length > 0 && sumOk && !submitting

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault()
    if (!canSubmit) return
    const weights: BenchmarkWeights = {}
    for (const component of BENCHMARK_COMPONENTS) {
      const percent = parsePercent(percents[component])
      if (percent > 0) weights[component] = percent / 100
    }
    onSubmit({ name: name.trim(), weights })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50"
    >
      <label className={labelClass}>
        Name
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Mein Zielmix"
          autoFocus
        />
      </label>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {BENCHMARK_COMPONENTS.map((component) => (
          <label key={component} className={labelClass}>
            <span className="flex items-baseline justify-between gap-2">
              <span>{COMPONENT_LABELS[component]}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">%</span>
            </span>
            <input
              className={inputClass}
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={percents[component]}
              onChange={(e) => setPercents((prev) => ({ ...prev, [component]: e.target.value }))}
              placeholder="0"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {BENCHMARK_UNIVERSES[universe][component].label}
            </span>
          </label>
        ))}
      </div>

      <p
        className={`text-sm ${
          sumOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
        }`}
      >
        Summe: {formatNumber(Math.round(sum * 10) / 10)} %
        {!sumOk && ' – die Gewichte müssen zusammen 100 % ergeben.'}
      </p>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Das Modell wird einmal im Jahr auf diese Gewichte zurückgesetzt – genau wie die fest
        eingebauten Modelle. Welcher Fonds hinter einem Baustein steckt, hängt am Universum oben:
        dasselbe Modell läuft im US- und im Global-Universum auf unterschiedliche Kursreihen.
      </p>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          {initial ? 'Speichern' : 'Anlegen'}
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
