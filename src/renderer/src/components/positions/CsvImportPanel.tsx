import { useEffect, useRef, useState } from 'react'
import type { BrokerFormat, CsvImportProgressEvent, CsvImportResult } from '@shared/types'
import { api } from '../../lib/api'
import { useImportCsv } from '../../lib/queries'

interface ResolveEntry {
  name: string
  status: 'resolving' | 'matched' | 'unresolved'
}

/** Nur Herkunftsvermerk für die importierten Buchungen: welches Format vorliegt, erkennt der
 *  Import selbst an der Kopfzeile der Datei (siehe csvFormats.ts). */
const BROKER_OPTIONS: { value: BrokerFormat; label: string }[] = [
  { value: 'AUTO', label: 'Broker automatisch erkennen' },
  { value: 'FINANZEN_ZERO', label: 'finanzen.net Zero' },
  { value: 'TRADE_REPUBLIC', label: 'Trade Republic' },
  { value: 'SCALABLE_CAPITAL', label: 'Scalable Capital' }
]

type Phase = 'idle' | 'importing' | 'done' | 'fading'

export function CsvImportPanel(): React.JSX.Element {
  const [broker, setBroker] = useState<BrokerFormat>('AUTO')
  const [phase, setPhase] = useState<Phase>('idle')
  const [entries, setEntries] = useState<Map<number, ResolveEntry>>(new Map())
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importCsv = useImportCsv()

  useEffect(() => {
    return api.transactions.onImportProgress((event: CsvImportProgressEvent) => {
      setEntries((prev) => {
        const next = new Map(prev)
        next.set(event.rowIndex, { name: event.name, status: event.status })
        return next
      })
    })
  }, [])

  // Nach "fertig" kurz stehen lassen (bei Fehler länger, damit die Meldung lesbar bleibt), dann
  // ausblenden und aus dem DOM nehmen - gleiches Muster wie ResetProgressPanel.
  useEffect(() => {
    if (phase !== 'done') return
    const toFading = setTimeout(() => setPhase('fading'), error ? 8000 : 6000)
    return () => clearTimeout(toFading)
  }, [phase, error])

  useEffect(() => {
    if (phase !== 'fading') return
    const toIdle = setTimeout(() => {
      setPhase('idle')
      setEntries(new Map())
      setResult(null)
      setError(null)
    }, 500)
    return () => clearTimeout(toIdle)
  }, [phase])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setEntries(new Map())
    setResult(null)
    setPhase('importing')

    const reader = new FileReader()
    reader.onload = () => {
      const csvText = String(reader.result ?? '')
      importCsv.mutate(
        { broker, csvText },
        {
          onSuccess: (res) => {
            setResult(res)
            setPhase('done')
          },
          onError: (err) => {
            setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
            setPhase('done')
          }
        }
      )
    }
    reader.onerror = () => {
      setError('Datei konnte nicht gelesen werden.')
      setPhase('done')
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-3">
      {phase === 'idle' && (
        <div className="flex items-center gap-2">
          <select
            value={broker}
            onChange={(e) => setBroker(e.target.value as BrokerFormat)}
            className="rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {BROKER_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            CSV importieren
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {phase !== 'idle' && (
        <div
          className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-opacity duration-500 dark:border-slate-700 dark:bg-slate-900 ${
            phase === 'fading' ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {error
                ? 'Import fehlgeschlagen'
                : phase === 'importing'
                  ? 'CSV wird importiert…'
                  : 'Import abgeschlossen'}
            </h3>
            {!error && phase !== 'importing' && (
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Fertig ✓
              </span>
            )}
          </div>

          {/* whitespace-pre-line: die Formatfehler-Meldung listet die gefundenen Spalten auf einer
              eigenen Zeile - ohne das würde der Umbruch verschluckt. */}
          {error && (
            <p className="text-sm whitespace-pre-line text-red-600 dark:text-red-400">{error}</p>
          )}

          {result && !error && (
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {result.transactionsImported} Transaktion
              {result.transactionsImported === 1 ? '' : 'en'} aus {result.positionsAffected}{' '}
              Position{result.positionsAffected === 1 ? '' : 'en'} importiert.
            </p>
          )}

          {entries.size > 0 && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {[...entries.entries()]
                .sort(([a], [b]) => a - b)
                .map(([rowIndex, entry]) => (
                  <li
                    key={rowIndex}
                    className="flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300"
                  >
                    <span className="truncate">{entry.name}</span>
                    {entry.status === 'resolving' ? (
                      <span
                        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-300"
                        aria-hidden="true"
                      />
                    ) : entry.status === 'matched' ? (
                      <span className="shrink-0 text-emerald-600 dark:text-emerald-400">✓</span>
                    ) : (
                      <span
                        className="shrink-0 text-amber-600 dark:text-amber-500"
                        title="Nicht automatisch zugeordnet"
                      >
                        ?
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          )}

          {result && result.unresolved.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {result.unresolved.length} Wertpapier{result.unresolved.length === 1 ? '' : 'e'}{' '}
                konnte
                {result.unresolved.length === 1 ? '' : 'n'} nicht automatisch zugeordnet werden
                (z.B. Hebelprodukte/Zertifikate) - bitte bei Bedarf manuell anlegen:
              </p>
              <ul className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {result.unresolved.map((u) => (
                  <li key={u.isin}>
                    {u.name} ({u.isin})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
