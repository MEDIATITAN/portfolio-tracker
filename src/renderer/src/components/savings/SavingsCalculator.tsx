import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { BudgetPeriod } from '@shared/types'
import { PERIOD_LABELS, PERIOD_ORDER } from '@shared/budget'
import { calculateSavings, type SavingsCalcInput, type SolveFor } from '@shared/savingsCalc'
import { formatEur } from '../../lib/format'
import { useTheme } from '../../lib/ThemeContext'
import { inputClass, labelClass } from '../positions/formStyles'

interface SavingsCalculatorProps {
  /** Summe der laufenden Sparraten im Monat, für den Übernehmen-Knopf. Null, wenn es keine gibt. */
  monthlyFromPlans: number | null
  /** Heutiger Wert der über Sparpläne gekauften Anteile - als Vorschlag fürs Anfangskapital. */
  valueFromPlans: number | null
}

const SOLVE_LABELS: Record<SolveFor, string> = {
  FINAL: 'Endkapital',
  RATE: 'Sparrate',
  YEARS: 'Laufzeit',
  RETURN: 'Rendite'
}

/** Abgeltungsteuer plus Solidaritätszuschlag - der übliche Satz auf Kapitalerträge. */
const DEFAULT_TAX = 26.375
/** Teilfreistellung für Aktienfonds und ETFs mit mindestens 51 % Aktienanteil. */
const EQUITY_FUND_EXEMPTION = 30

const DEFAULTS: SavingsCalcInput = {
  initial: 1000,
  rate: 150,
  period: 'MONTHLY',
  returnPercent: 7,
  years: 15,
  target: 100000,
  taxPercent: 0,
  taxExemptionPercent: 0
}

/** "15 Jahre" oder "15 Jahre, 1 Monat" - eine gesuchte Laufzeit endet selten glatt. */
function formatDuration(years: number): string {
  const whole = Math.floor(years + 1e-9)
  const months = Math.round((years - whole) * 12)
  const y = `${whole} ${whole === 1 ? 'Jahr' : 'Jahre'}`
  if (months === 0) return y
  return `${y}, ${months} ${months === 1 ? 'Monat' : 'Monate'}`
}

function Result({
  label,
  value,
  tone,
  hint
}: {
  label: string
  value: string
  tone?: 'gain' | 'muted'
  hint?: string
}): React.JSX.Element {
  const color =
    tone === 'gain'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'muted'
        ? 'text-slate-600 dark:text-slate-400'
        : 'text-slate-900 dark:text-slate-100'
  return (
    <div className="flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

export function SavingsCalculator({
  monthlyFromPlans,
  valueFromPlans
}: SavingsCalculatorProps): React.JSX.Element {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [open, setOpen] = useState(false)
  const [solveFor, setSolveFor] = useState<SolveFor>('FINAL')
  const [form, setForm] = useState<SavingsCalcInput>(DEFAULTS)
  const [withTax, setWithTax] = useState(false)
  const [equityFund, setEquityFund] = useState(true)

  function update<K extends keyof SavingsCalcInput>(key: K, value: SavingsCalcInput[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const result = calculateSavings(
    {
      ...form,
      taxPercent: withTax ? DEFAULT_TAX : 0,
      taxExemptionPercent: withTax && equityFund ? EQUITY_FUND_EXEMPTION : 0
    },
    solveFor
  )

  const chartData = result.rows.map((r) => ({
    year: Number(r.year.toFixed(2)),
    Einzahlungen: Math.round(r.contributed),
    Gewinn: Math.round(Math.max(0, r.gain))
  }))

  function applyFromPlans(): void {
    if (monthlyFromPlans !== null) {
      setForm((prev) => ({
        ...prev,
        rate: Number(monthlyFromPlans.toFixed(2)),
        period: 'MONTHLY',
        initial: valueFromPlans !== null ? Number(valueFromPlans.toFixed(2)) : prev.initial
      }))
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Sparplanrechner
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Was am Ende herauskommt - oder wie viel du dafür brauchst
          </p>
        </div>
        <span className="text-slate-400 dark:text-slate-500">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Was möchtest du berechnen?
            </span>
            {(Object.keys(SOLVE_LABELS) as SolveFor[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSolveFor(k)}
                className={`rounded border px-3 py-1 text-sm ${
                  solveFor === k
                    ? 'border-slate-900 bg-slate-900 font-medium text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {SOLVE_LABELS[k]}
              </button>
            ))}
            {monthlyFromPlans !== null && (
              <button
                type="button"
                onClick={applyFromPlans}
                title="Übernimmt die Summe deiner laufenden Sparraten und den heutigen Wert der darüber gekauften Anteile"
                className="ml-auto rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Aus meinen Sparplänen übernehmen
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <label className={labelClass}>
              Anfangskapital
              <input
                type="number"
                step="any"
                min="0"
                className={inputClass}
                value={form.initial}
                onChange={(e) => update('initial', Number(e.target.value))}
              />
            </label>

            {solveFor !== 'RATE' && (
              <label className={labelClass}>
                Sparrate
                <input
                  type="number"
                  step="any"
                  min="0"
                  className={inputClass}
                  value={form.rate}
                  onChange={(e) => update('rate', Number(e.target.value))}
                />
              </label>
            )}

            <label className={labelClass}>
              Sparintervall
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

            {solveFor !== 'RETURN' && (
              <label className={labelClass}>
                Rendite p.a.
                <input
                  type="number"
                  step="any"
                  className={inputClass}
                  value={form.returnPercent}
                  onChange={(e) => update('returnPercent', Number(e.target.value))}
                />
                <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                  in Prozent, z.B. 7
                </span>
              </label>
            )}

            {solveFor !== 'YEARS' && (
              <label className={labelClass}>
                Laufzeit in Jahren
                <input
                  type="number"
                  step="any"
                  min="0"
                  className={inputClass}
                  value={form.years}
                  onChange={(e) => update('years', Number(e.target.value))}
                />
              </label>
            )}

            {solveFor !== 'FINAL' && (
              <label className={labelClass}>
                Zielkapital
                <input
                  type="number"
                  step="any"
                  min="0"
                  className={inputClass}
                  value={form.target}
                  onChange={(e) => update('target', Number(e.target.value))}
                />
              </label>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={withTax}
                onChange={(e) => setWithTax(e.target.checked)}
              />
              Kapitalertragsteuer abziehen ({DEFAULT_TAX.toLocaleString('de-DE')} %)
            </label>
            {withTax && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={equityFund}
                  onChange={(e) => setEquityFund(e.target.checked)}
                />
                Aktienfonds/ETF – {EQUITY_FUND_EXEMPTION} % Teilfreistellung
              </label>
            )}
          </div>

          {result.error && (
            <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {result.error}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            {solveFor !== 'FINAL' && result.solved !== null && (
              <Result
                label={`Benötigte ${SOLVE_LABELS[solveFor]}`}
                value={
                  solveFor === 'RATE'
                    ? `${formatEur(result.solved)} ${PERIOD_LABELS[form.period]}`
                    : solveFor === 'YEARS'
                      ? formatDuration(result.solved)
                      : `${result.solved.toLocaleString('de-DE', { maximumFractionDigits: 2 })} % p.a.`
                }
              />
            )}
            <Result
              label={withTax ? 'Endkapital nach Steuer' : 'Endkapital'}
              value={formatEur(withTax ? result.finalAfterTax : result.finalValue)}
            />
            <Result label="davon eingezahlt" value={formatEur(result.contributed)} tone="muted" />
            <Result
              label="davon Rendite"
              value={formatEur(result.gain)}
              tone="gain"
              hint={
                result.contributed > 0
                  ? `${((result.gain / result.contributed) * 100).toLocaleString('de-DE', {
                      maximumFractionDigits: 1
                    })} % auf das Eingezahlte`
                  : undefined
              }
            />
            {withTax && <Result label="Steuer" value={formatEur(result.tax)} tone="muted" />}
          </div>

          <div className="mt-4">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickFormatter={(y) => `${Math.round(y)}`}
                  label={{
                    value: 'Jahre',
                    position: 'insideBottomRight',
                    offset: -2,
                    fontSize: 11,
                    fill: isDark ? '#94a3b8' : '#64748b'
                  }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={45}
                />
                <Tooltip
                  formatter={(value) => formatEur(typeof value === 'number' ? value : null)}
                  labelFormatter={(y) => `Nach ${Math.round(Number(y))} Jahren`}
                  contentStyle={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    borderColor: isDark ? '#475569' : '#e2e8f0',
                    color: isDark ? '#f1f5f9' : '#0f172a'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Gestapelt: unten das Eingezahlte, darüber der Zuwachs - zusammen ergeben sie
                    den Depotwert, und man sieht, ab wann die Rendite die Einzahlungen überholt. */}
                <Area
                  type="monotone"
                  dataKey="Einzahlungen"
                  stackId="1"
                  stroke={isDark ? '#60a5fa' : '#2563eb'}
                  fill={isDark ? '#1e3a8a' : '#bfdbfe'}
                />
                <Area
                  type="monotone"
                  dataKey="Gewinn"
                  stackId="1"
                  stroke={isDark ? '#4ade80' : '#16a34a'}
                  fill={isDark ? '#14532d' : '#bbf7d0'}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              Jahr für Jahr anzeigen
            </summary>
            <div className="mt-2 max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white text-left text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="py-1 font-medium">Jahr</th>
                    <th className="py-1 text-right font-medium">Eingezahlt</th>
                    <th className="py-1 text-right font-medium">Rendite</th>
                    <th className="py-1 text-right font-medium">Depotwert</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-300">
                  {result.rows.map((r) => (
                    <tr key={r.year} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1">
                        {Number.isInteger(r.year) ? r.year : formatDuration(r.year)}
                      </td>
                      <td className="py-1 text-right">{formatEur(r.contributed)}</td>
                      <td className="py-1 text-right text-emerald-600 dark:text-emerald-400">
                        {formatEur(r.gain)}
                      </td>
                      <td className="py-1 text-right font-medium">{formatEur(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Gerechnet wird mit gleichbleibender Rendite und der Rate zu Beginn jedes Intervalls. Die
            Wirklichkeit schwankt - das Ergebnis zeigt die Größenordnung, keine Vorhersage.
          </p>
        </div>
      )}
    </div>
  )
}
