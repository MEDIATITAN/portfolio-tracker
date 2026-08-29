import { ipcMain } from 'electron'
import * as historicalRepo from '../db/historicalRepo'

export function registerHistoricalHandlers(): void {
  ipcMain.handle('historical:list', () => ({
    prices: historicalRepo.listAllHistoricalPrices(),
    fxRates: historicalRepo.listAllHistoricalFxRates()
  }))
}
