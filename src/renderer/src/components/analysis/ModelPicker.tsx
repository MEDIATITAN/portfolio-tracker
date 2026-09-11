import type { ComparableModel, CustomBenchmarkModel } from '@shared/benchmarkCalc'

interface ModelPickerProps {
  models: ComparableModel[]
  /** Schlüssel der Modelle, die im Vergleich stehen. */
  selected: Set<string>
  onToggle: (key: string) => void
  /**
   * Modelle, für die im gewählten Zeitraum keine vollständigen Kursreihen vorliegen. Sie bleiben
   * anklickbar - die Auswahl gilt weiter, sobald die Daten nachgeladen sind.
   */
  unavailable: Set<string>
  onCreate: () => void
  onEdit: (model: CustomBenchmarkModel) => void
  onDelete: (model: CustomBenchmarkModel) => void
  /** Die eigenen Modelle in ihrer Rohform - für Bearbeiten und Löschen. */
  customModels: CustomBenchmarkModel[]
}

export function ModelPicker({
  models,
  selected,
  onToggle,
  unavailable,
  onCreate,
  onEdit,
  onDelete,
  customModels
}: ModelPickerProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Modelle im Vergleich
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selected.size} von {models.length} ausgewählt
          </span>
          <button
            type="button"
            onClick={onCreate}
            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            + Eigenes Modell
          </button>
        </div>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        {models.map((model) => {
          const custom = model.isCustom
            ? customModels.find((m) => `custom:${m.id}` === model.key)
            : undefined
          const isMissing = unavailable.has(model.key)
          return (
            <li
              key={model.key}
              className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <input
                type="checkbox"
                id={`model-${model.key}`}
                checked={selected.has(model.key)}
                onChange={() => onToggle(model.key)}
                className="mt-1"
              />
              <label htmlFor={`model-${model.key}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="flex items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                  {model.label}
                  {model.isCustom && (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      eigenes
                    </span>
                  )}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {model.description}
                </span>
                {isMissing && (
                  <span className="block text-xs text-amber-600 dark:text-amber-400">
                    Kursreihen fehlen noch – &bdquo;Daten aktualisieren&ldquo; holt sie nach.
                  </span>
                )}
              </label>
              {custom && (
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(custom)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(custom)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-red-100 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                  >
                    Löschen
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
