import { useEffect, useState } from 'react'
import type { ResetProgressEvent } from '@shared/types'
import type { ResetEntry } from '../components/positions/ResetProgressPanel'
import { api } from './api'

type ResetPhase = 'idle' | 'running' | 'done' | 'fading'

export interface ResetRun {
  /** true, solange die Fortschrittsanzeige eingeblendet werden soll. */
  visible: boolean
  entries: ResetEntry[]
  allDone: boolean
  fading: boolean
  error: string | null
  isRunning: boolean
  /**
   * Startet einen Durchlauf. `mutate` bekommt Callbacks im Stil von TanStack Query, damit
   * beliebige Zurücksetz-Mutationen (gesamt oder je Bereich) hier durchlaufen können.
   */
  start: (
    mutate: (callbacks: { onSuccess: () => void; onError: (err: unknown) => void }) => void
  ) => void
}

/**
 * Zustand und Fortschritt eines Zurücksetz-Durchlaufs.
 *
 * Ausgelagert, weil ihn zwei Seiten brauchen: die Positionen-Seite für das vollständige
 * Zurücksetzen und die Übersicht für das bereichsweise. Der Fortschritt kommt über einen einzigen
 * Kanal aus dem Hauptprozess - es kann ohnehin immer nur ein Durchlauf gleichzeitig laufen.
 */
export function useResetRun(): ResetRun {
  const [phase, setPhase] = useState<ResetPhase>('idle')
  const [entries, setEntries] = useState<Map<number, ResetEntry>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // Eine Meldung pro Position aus dem Hauptprozess, während dort die historischen Daten neu
  // geholt werden.
  useEffect(() => {
    return api.snapshots.onResetProgress((event: ResetProgressEvent) => {
      setEntries((prev) => {
        const next = new Map(prev)
        next.set(event.positionId, { id: event.positionId, name: event.name, status: event.status })
        return next
      })
    })
  }, [])

  // Nach "fertig" kurz stehen lassen, dann ausblenden (opacity-Übergang), dann aus dem DOM nehmen.
  useEffect(() => {
    if (phase !== 'done') return
    const toFading = setTimeout(() => setPhase('fading'), error ? 6000 : 1800)
    return () => clearTimeout(toFading)
  }, [phase, error])

  useEffect(() => {
    if (phase !== 'fading') return
    const toIdle = setTimeout(() => {
      setPhase('idle')
      setEntries(new Map())
      setError(null)
    }, 500)
    return () => clearTimeout(toIdle)
  }, [phase])

  return {
    visible: phase !== 'idle',
    entries: [...entries.values()],
    allDone: phase === 'done' || phase === 'fading',
    fading: phase === 'fading',
    error,
    isRunning: phase === 'running',
    start(mutate) {
      if (phase === 'running') return
      setError(null)
      setEntries(new Map())
      setPhase('running')
      mutate({
        onSuccess: () => setPhase('done'),
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
          setPhase('done')
        }
      })
    }
  }
}
