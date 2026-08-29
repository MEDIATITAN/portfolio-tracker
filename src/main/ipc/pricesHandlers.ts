import { ipcMain } from 'electron'
import * as priceCacheRepo from '../db/priceCacheRepo'
import * as fxRepo from '../db/fxRepo'
import * as priceService from '../services/priceService'

export function registerPricesHandlers(): void {
  ipcMain.handle('prices:getAll', () => priceCacheRepo.listPriceCache())

  ipcMain.handle('fx:getAll', () => fxRepo.listFxRates())

  ipcMain.handle('prices:refreshAll', () => priceService.refreshAll())
}
