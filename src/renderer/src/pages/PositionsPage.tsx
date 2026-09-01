import { useEffect, useRef, useState } from 'react'
import type { NewPosition, Position, ResetProgressEvent } from '@shared/types'
import { PositionForm } from '../components/positions/PositionForm'
import { PositionsTable } from '../components/positions/PositionsTable'
import { ResetProgressPanel, type ResetEntry } from '../components/positions/ResetProgressPanel'
import { CsvImportPanel } from '../components/positions/CsvImportPanel'
import { RefreshButton } from '../components/common/RefreshButton'
import { LastUpdatedBadge } from '../components/common/LastUpdatedBadge'
import { shouldAutoRefresh } from '../lib/autoRefresh'
import { api } from '../lib/api'
import {
  useCreatePosition,
  useDeleteAllPositions,
  useDeletePosition,
  useFxRates,
  usePositions,
  usePriceCache,
  useRefreshPrices,
  useResetSnapshots,
  useUpdatePosition
} from '../lib/queries'

type ResetPhase = 'idle' | 'running' | 'done' | 'fading'

export function PositionsPage(): React.JSX.Element {
  const { data: positions, isLoading, error } = usePositions()
  const { data: priceCache } = usePriceCache()
  const { data: fxRates } = useFxRates()
  const createPosition = useCreatePosition()
  const updatePosition = useUpdatePosition()
  const deletePosition = useDeletePosition()
  const refreshPrices = useRefreshPrices()
  const resetSnapshots = useResetSnapshots()
  const deleteAllPositions = useDeleteAllPositions()

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  const [resetPhase, setResetPhase] = useState<ResetPhase>('idle')
  const [resetEntries, setResetEntries] = useState<Map<number, ResetEntry>>(new Map())
  const [resetError, setResetError] = useState<string | null>(null)

  // Kurse automatisch aktualisieren, wenn auf diesen Tab gewechselt wird (mit Bremse gegen
  // API-Spam bei schnellem Hin- und Herklicken - siehe shouldAutoRefresh).
  useEffect(() => {
    if (shouldAutoRefresh()) refreshPrices.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fortschritt der laufenden Zurücksetzen-Aktion (siehe handleReset) - eine Meldung pro
  // Position vom Main-Prozess, während dort die historischen Daten neu geprüft/nachgeladen werden.
  useEffect(() => {
    return api.snapshots.onResetProgress((event: ResetProgressEvent) => {
      setResetEntries((prev) => {
        const next = new Map(prev)
        next.set(event.positionId, { id: event.positionId, name: event.name, status: event.status })
        return next
      })
    })
  }, [])

  // Nach "fertig" kurz stehen lassen, dann ausblenden (opacity-Übergang), dann aus dem DOM nehmen.
  useEffect(() => {
    if (resetPhase !== 'done') return
    const toFading = setTimeout(() => setResetPhase('fading'), resetError ? 6000 : 1800)
    return () => clearTimeout(toFading)
  }, [resetPhase, resetError])

  useEffect(() => {
    if (resetPhase !== 'fading') return
    const toIdle = setTimeout(() => {
      setResetPhase('idle')
      setResetEntries(new Map())
      setResetError(null)
    }, 500)
    return () => clearTimeout(toIdle)
  }, [resetPhase])

  function handleReset(): void {
    if (resetSnapshots.isPending) return
    const ok = confirm(
      'Der bisherige Verlauf des Gesamtvermögens wird gelöscht und aus den aktuell eingetragenen Positionen neu berechnet. Fortfahren?'
    )
    if (!ok) return
    setResetError(null)
    setResetEntries(new Map())
    setResetPhase('running')
    resetSnapshots.mutate(undefined, {
      onSuccess: () => setResetPhase('done'),
      onError: (err) => {
        setResetError(err instanceof Error ? err.message : 'Unbekannter Fehler')
        setResetPhase('done')
      }
    })
  }

  function closeForm(): void {
    setShowForm(false)
    setEditing(null)
  }

  function handleSubmit(input: NewPosition): void {
    if (editing) {
      updatePosition.mutate({ ...input, id: editing.id }, { onSuccess: closeForm })
    } else {
      createPosition.mutate(input, { onSuccess: closeForm })
    }
  }

  function handleEdit(position: Position): void {
    setEditing(position)
    setShowForm(true)
  }

  // Zum Formular scrollen, sobald es zum Bearbeiten geöffnet wurde. Bewusst in einem Effekt und
  // nicht direkt in handleEdit: dort existiert das Element noch gar nicht, es entsteht erst durch
  // das setShowForm ausgelöste Rendern. Läuft auch beim Wechsel auf eine ANDERE Position (editing
  // in den Abhängigkeiten), weil das Formular dann neu befüllt wird.
  useEffect(() => {
    if (showForm && editing) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [showForm, editing])

  function handleDelete(id: number): void {
    if (confirm('Diese Position wirklich löschen?')) {
      deletePosition.mutate(id)
    }
  }

  function handleDeleteAll(): void {
    if (deleteAllPositions.isPending) return
    const ok = confirm(
      'Wirklich ALLE Positionen unwiderruflich löschen? Das löscht auch den kompletten Kauf/Verkauf-Verlauf und den Vermögensverlauf. Das kann nicht rückgängig gemacht werden.'
    )
    if (!ok) return
    deleteAllPositions.mutate()
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Positionen</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Deine Positionen im Überblick
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <RefreshButton
              onRefresh={() => refreshPrices.mutate()}
              isRefreshing={refreshPrices.isPending}
            />
            <LastUpdatedBadge
              updatedCount={refreshPrices.data?.updatedCount ?? null}
              failedCount={refreshPrices.data?.failedIdentifiers.length ?? 0}
            />
          </div>
          <button
            onClick={handleReset}
            disabled={resetSnapshots.isPending}
            title="Löscht den Verlauf des Gesamtvermögens und berechnet ihn aus den aktuellen Positionen neu"
            className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            Zurücksetzen
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={deleteAllPositions.isPending}
            title="Löscht alle Positionen, den Verlauf und den Vermögensverlauf unwiderruflich"
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
          >
            Alle Positionen löschen
          </button>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              + Position hinzufügen
            </button>
          )}
        </div>
      </header>

      <CsvImportPanel />

      {resetPhase !== 'idle' && (
        <ResetProgressPanel
          entries={[...resetEntries.values()]}
          allDone={resetPhase === 'done' || resetPhase === 'fading'}
          error={resetError}
          fading={resetPhase === 'fading'}
        />
      )}

      {showForm && (
        <div ref={formRef}>
          <PositionForm
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            submitting={createPosition.isPending || updatePosition.isPending}
          />
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500 dark:text-slate-400">Lade Positionen…</p>}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">Fehler beim Laden: {String(error)}</p>
      )}
      {positions && (
        <PositionsTable
          positions={positions}
          priceCache={priceCache ?? []}
          fxRates={fxRates ?? []}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
