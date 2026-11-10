import type { DisplayClass } from '@shared/displayClass'
import type {
  BenchmarkUniverse,
  CustomBenchmarkModelUpdate,
  NewCustomBenchmarkModel
} from '@shared/benchmarkCalc'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type {
  BrokerFormat,
  BudgetItemUpdate,
  NewBudgetItem,
  NewPosition,
  NewSavingsPlan,
  PositionUpdate,
  SavingsPlanUpdate
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
      // Ein neues Guthaben beginnt seinen Kontostands-Verlauf mit dem Anfangsstand.
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
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
      // Ein geänderter Kontostand ist ein neuer Eintrag im Verlauf des Kontos.
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
    }
  })
}

export function useDeletePosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.positions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      // Der Verlauf eines gelöschten Kontos geht mit (Löschweitergabe in der Datenbank).
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
    }
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
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
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

/**
 * Der Verlauf aller Kontostände - je Konto gruppiert wird in der Positionsliste. Eine Abfrage für
 * alle statt einer je Konto: die Daten sind klein (eine Zeile je Änderung), und der Verlauf soll
 * beim Aufklappen sofort da sein, ohne erst zu laden.
 */
export function useCashBalanceHistory() {
  return useQuery({ queryKey: ['cashHistory'], queryFn: () => api.cashHistory.list() })
}

export function useBudgetItems() {
  return useQuery({ queryKey: ['budget'], queryFn: () => api.budget.list() })
}

/** Alle Budget-Änderungen laden dieselbe Liste neu - sie ist die einzige Quelle der Seite. */
function useBudgetMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      // Anlegen und Ändern buchen sofort auf das zugeordnete Konto - der Kontostand hat sich
      // dadurch geändert.
      queryClient.invalidateQueries({ queryKey: ['budgetBookings'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
    }
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

export function useBudgetBookings() {
  return useQuery({ queryKey: ['budgetBookings'], queryFn: () => api.budget.listBookings() })
}

/**
 * Buchungen verändern Kontostände - deshalb müssen danach auch Positionen, Kurse und der Verlauf
 * neu geladen werden, nicht nur die Budgetliste.
 */
function useBookingMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] })
      queryClient.invalidateQueries({ queryKey: ['budgetBookings'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
    }
  })
}

export function useRunBudgetBookings() {
  return useBookingMutation(() => api.budget.runBookings())
}

export function useUndoBudgetBookingMonth() {
  return useBookingMutation((month: string) => api.budget.undoBookingMonth(month))
}

export function useSavingsPlans() {
  return useQuery({ queryKey: ['savingsPlans'], queryFn: () => api.savingsPlans.list() })
}

/**
 * Jede Sparplan-Änderung kann Buchungen anlegen - deshalb werden auch Positionen und der Verlauf
 * neu geladen, nicht nur die Planliste.
 */
function useSavingsPlanMutation<TInput>(fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savingsPlans'] })
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    }
  })
}

export function useCreateSavingsPlan() {
  return useSavingsPlanMutation((input: NewSavingsPlan) => api.savingsPlans.create(input))
}

export function useUpdateSavingsPlan() {
  return useSavingsPlanMutation((input: SavingsPlanUpdate) => api.savingsPlans.update(input))
}

export function useDeleteSavingsPlan() {
  return useSavingsPlanMutation((id: number) => api.savingsPlans.delete(id))
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

/**
 * Die gespeicherten Vergleichsreihen. Lädt bewusst nichts aus dem Netz nach - das übernimmt
 * usePrepareAnalysis, damit das Öffnen der Seite nicht auf einen Abruf wartet.
 */
export function useBenchmarks(universe: BenchmarkUniverse, fromDate: string) {
  return useQuery({
    queryKey: ['benchmarks', universe, fromDate],
    queryFn: () => api.analyse.benchmarks(universe, fromDate)
  })
}

export function usePrepareAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ universe, fromDate }: { universe: BenchmarkUniverse; fromDate: string }) =>
      api.analyse.prepare(universe, fromDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['benchmarks'] })
      // Der Abruf verlängert nebenbei die eigenen Kursreihen.
      queryClient.invalidateQueries({ queryKey: ['historical'] })
      // ... und holt die Sektor-/Länderaufteilung des Vergleichsindex, die der
      // Zusammensetzungs-Vergleich für die Modellseite braucht.
      queryClient.invalidateQueries({ queryKey: ['etfComposition'] })
    }
  })
}

/** Die selbst angelegten Vergleichsmodelle. Die fest eingebauten stehen im Code (BENCHMARK_MODELS). */
export function useCustomModels() {
  return useQuery({ queryKey: ['customModels'], queryFn: () => api.analyse.listModels() })
}

function useCustomModelMutation<TInput, TResult>(fn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customModels'] })
  })
}

export function useCreateCustomModel() {
  return useCustomModelMutation((input: NewCustomBenchmarkModel) => api.analyse.createModel(input))
}

export function useUpdateCustomModel() {
  return useCustomModelMutation((input: CustomBenchmarkModelUpdate) =>
    api.analyse.updateModel(input)
  )
}

export function useDeleteCustomModel() {
  return useCustomModelMutation((id: number) => api.analyse.deleteModel(id))
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
      // ... und bucht fällige Budget-Monate auf die Konten - deren Verlauf wächst dabei.
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] })
    }
  })
}
