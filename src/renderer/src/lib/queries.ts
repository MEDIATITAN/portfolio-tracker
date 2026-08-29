import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { AssetClass, BrokerFormat, NewPosition, PositionUpdate } from '@shared/types'

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

export function useSymbolSearch(assetClass: AssetClass, query: string) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['symbolSearch', assetClass, trimmed],
    queryFn: () => api.positions.lookupSymbol(assetClass, trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 60_000
  })
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

export function useTransactions() {
  return useQuery({ queryKey: ['transactions'], queryFn: () => api.transactions.list() })
}

export function useImportCsv() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ broker, csvText }: { broker: BrokerFormat; csvText: string }) => api.transactions.importCsv(broker, csvText),
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
    }
  })
}
