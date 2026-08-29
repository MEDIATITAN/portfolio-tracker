import { contextBridge, ipcRenderer } from 'electron'
import type { AssetClass, NewPosition, PortfolioApi, PositionUpdate, ResetProgressEvent, Settings } from '../shared/types'

const api: PortfolioApi = {
  positions: {
    list: () => ipcRenderer.invoke('positions:list'),
    create: (input: NewPosition) => ipcRenderer.invoke('positions:create', input),
    update: (input: PositionUpdate) => ipcRenderer.invoke('positions:update', input),
    delete: (id: number) => ipcRenderer.invoke('positions:delete', id),
    lookupSymbol: (assetClass: AssetClass, query: string) =>
      ipcRenderer.invoke('positions:lookupSymbol', assetClass, query),
    getAssetProfile: (identifier: string) => ipcRenderer.invoke('positions:getAssetProfile', identifier)
  },
  prices: {
    refreshAll: () => ipcRenderer.invoke('prices:refreshAll'),
    getAll: () => ipcRenderer.invoke('prices:getAll')
  },
  fx: {
    getAll: () => ipcRenderer.invoke('fx:getAll')
  },
  snapshots: {
    list: () => ipcRenderer.invoke('snapshots:list'),
    reset: () => ipcRenderer.invoke('snapshots:reset'),
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
