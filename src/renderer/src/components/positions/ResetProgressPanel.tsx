export interface ResetEntry {
  id: number
  name: string
  status: 'processing' | 'done'
}

interface ResetProgressPanelProps {
  entries: ResetEntry[]
  allDone: boolean
  error: string | null
  fading: boolean
}

export function ResetProgressPanel({ entries, allDone, error, fading }: ResetProgressPanelProps): React.JSX.Element {
  const doneCount = entries.filter((e) => e.status === 'done').length

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-opacity duration-500 dark:border-slate-700 dark:bg-slate-900 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {error ? 'Neuberechnung fehlgeschlagen' : allDone ? 'Verlauf neu berechnet' : 'Verlauf wird neu berechnet…'}
        </h3>
        {!error &&
          (allDone ? (
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Fertig ✓</span>
          ) : (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {doneCount} / {entries.length}
            </span>
          ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {entries.length > 0 && (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300"
            >
              <span className="truncate">{entry.name}</span>
              {entry.status === 'done' ? (
                <span className="shrink-0 text-emerald-600 dark:text-emerald-400">✓</span>
              ) : (
                <span
                  className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
