import type { DisplayClass } from '../shared/displayClass'
import { contextBridge, ipcRenderer } from 'electron'
import type {
  BrokerFormat,
  BudgetItemUpdate,
  CsvImportProgressEvent,
  NewBudgetItem,
  NewPosition,
  PortfolioApi,
  PositionUpdate,
  ResetProgressEvent,
  Settings
} from '../shared/types'

const api: PortfolioApi = {
  positions: {
    list: () => ipcRenderer.invoke('positions:list'),
    create: (input: NewPosition) => ipcRenderer.invoke('positions:create', input),
    update: (input: PositionUpdate) => ipcRenderer.invoke('positions:update', input),
    delete: (id: number) => ipcRenderer.invoke('positions:delete', id),
    deleteAll: () => ipcRenderer.invoke('positions:deleteAll'),
    lookupSymbol: (kind: DisplayClass, query: string) =>
      ipcRenderer.invoke('positions:lookupSymbol', kind, query),
    getAssetProfile: (identifier: string) =>
      ipcRenderer.invoke('positions:getAssetProfile', identifier)
  },
  prices: {
    refreshAll: () => ipcRenderer.invoke('prices:refreshAll'),
    getAll: () => ipcRenderer.invoke('prices:getAll'),
    getQuotes: (kind: DisplayClass, identifiers: string[]) =>
      ipcRenderer.invoke('prices:getQuotes', kind, identifiers)
  },
  fx: {
    getAll: () => ipcRenderer.invoke('fx:getAll')
  },
  snapshots: {
    list: () => ipcRenderer.invoke('snapshots:list'),
    reset: () => ipcRenderer.invoke('snapshots:reset'),
    resetClass: (cls: DisplayClass) => ipcRenderer.invoke('snapshots:resetClass', cls),
    onResetProgress: (callback: (event: ResetProgressEvent) => void) => {
      const listener = (_: unknown, payload: ResetProgressEvent) => callback(payload)
      ipcRenderer.on('snapshots:reset-progress', listener)
      return () => ipcRenderer.removeListener('snapshots:reset-progress', listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (input: Partial<Settings>) => ipcRenderer.invoke('settings:set', input)
  },
  historical: {
    list: () => ipcRenderer.invoke('historical:list')
  },
  etfComposition: {
    list: () => ipcRenderer.invoke('etfComposition:list')
  },
  budget: {
    list: () => ipcRenderer.invoke('budget:list'),
    create: (input: NewBudgetItem) => ipcRenderer.invoke('budget:create', input),
    update: (input: BudgetItemUpdate) => ipcRenderer.invoke('budget:update', input),
    delete: (id: number) => ipcRenderer.invoke('budget:delete', id)
  },
  transactions: {
    list: () => ipcRenderer.invoke('transactions:list'),
    delete: (id: number) => ipcRenderer.invoke('transactions:delete', id),
    importCsv: (broker: BrokerFormat, csvText: string) =>
      ipcRenderer.invoke('transactions:importCsv', broker, csvText),
    onImportProgress: (callback: (event: CsvImportProgressEvent) => void) => {
      const listener = (_: unknown, payload: CsvImportProgressEvent) => callback(payload)
      ipcRenderer.on('transactions:import-progress', listener)
      return () => ipcRenderer.removeListener('transactions:import-progress', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
