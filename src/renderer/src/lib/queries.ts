import type { DisplayClass } from '@shared/displayClass'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  BrokerFormat,
  BudgetItemUpdate,
  NewBudgetItem,
  NewPosition,
  PositionUpdate
} from '@shared/types'

export function usePositions() {
  return useQuery({ queryKey: ['positions'], queryFn: () => api.positions.list() })
}

export function useCreatePosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NewPosition) => api.positions.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      // ensureHistoricalData ist beim Anlegen mitgelaufen (deshalb dauert es länger) - neue
      // historische Daten stehen jetzt bereit.
      queryClient.invalidateQueries({ queryKey: ['historical'] })
    }
  })
}

export function useUpdatePosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PositionUpdate) => api.positions.update(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['historical'] })
    }
  })
}

export function useDeletePosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.positions.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['positions'] })
  })
}

export function useDeleteAllPositions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.positions.deleteAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['historical'] })
      queryClient.invalidateQueries({ queryKey: ['priceCache'] })
      queryClient.invalidateQueries({ queryKey: ['fxRates'] })
    }
  })
}

export function usePriceCache() {
  return useQuery({ queryKey: ['priceCache'], queryFn: () => api.prices.getAll() })
}

export function useFxRates() {
  return useQuery({ queryKey: ['fxRates'], queryFn: () => api.fx.getAll() })
}

export function useSnapshots() {
  return useQuery({ queryKey: ['snapshots'], queryFn: () => api.snapshots.list() })
}

export function useHistoricalData() {
  return useQuery({ queryKey: ['historical'], queryFn: () => api.historical.list() })
}

export function useEtfComposition() {
  return useQuery({ queryKey: ['etfComposition'], queryFn: () => api.etfComposition.list() })
}

/**
 * Kurse zu den aktuellen Suchtreffern. Bewusst als EIGENE Abfrage nach der Suche, nicht in einem
 * Rutsch: der Kursabruf dauert rund eine Sekunde, die Vorschlagsliste soll aber sofort erscheinen.
 */
export function useSearchQuotes(kind: DisplayClass, identifiers: string[]) {
  return useQuery({
    queryKey: ['searchQuotes', kind, identifiers.join(',')],
    queryFn: () => api.prices.getQuotes(kind, identifiers),
    enabled: identifiers.length > 0,
    staleTime: 60_000
  })
}

export function useSymbolSearch(kind: DisplayClass, query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['symbolSearch', kind, trimmed],
    queryFn: () => api.positions.lookupSymbol(kind, trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000
  })
}

/**
 * Löscht eine einzelne Buchung. Danach müssen BEIDE Listen neu geladen werden: die Buchungen
 * selbst und die Positionen, deren Bestand und Einstandspreis sich dadurch ändern.
 */
export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.transactions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    }
  })
}

export function useBudgetItems() {
  return useQuery({ queryKey: ['budget'], queryFn: () => api.budget.list() })
}

/** Alle Budget-Änderungen laden dieselbe Liste neu - sie ist die einzige Quelle der Seite. */
function useBudgetMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] })
  })
}

export function useCreateBudgetItem() {
  return useBudgetMutation((input: NewBudgetItem) => api.budget.create(input))
}

export function useUpdateBudgetItem() {
  return useBudgetMutation((input: BudgetItemUpdate) => api.budget.update(input))
}

export function useDeleteBudgetItem() {
  return useBudgetMutation((id: number) => api.budget.delete(id))
}

export function useResetSnapshots() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.snapshots.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['historical'] })
      queryClient.invalidateQueries({ queryKey: ['priceCache'] })
      queryClient.invalidateQueries({ queryKey: ['fxRates'] })
    }
  })
}

/** Wie useResetSnapshots, aber nur für einen Bereich - der Snapshot-Verlauf bleibt dabei stehen. */
export function useResetClass() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (cls: DisplayClass) => api.snapshots.resetClass(cls),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['historical'] })
      queryClient.invalidateQueries({ queryKey: ['priceCache'] })
      queryClient.invalidateQueries({ queryKey: ['fxRates'] })
    }
  })
}

export function useTransactions() {
  return useQuery({ queryKey: ['transactions'], queryFn: () => api.transactions.list() })
}

export function useImportCsv() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ broker, csvText }: { broker: BrokerFormat; csvText: string }) =>
      api.transactions.importCsv(broker, csvText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['historical'] })
      queryClient.invalidateQueries({ queryKey: ['priceCache'] })
      queryClient.invalidateQueries({ queryKey: ['fxRates'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
    }
  })
}

export function useRefreshPrices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.prices.refreshAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priceCache'] })
      queryClient.invalidateQueries({ queryKey: ['fxRates'] })
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      // refreshAll pflegt nebenbei Fondszusammensetzung + Anlageklassen-Einstufung mit.
      queryClient.invalidateQueries({ queryKey: ['etfComposition'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    }
  })
}
