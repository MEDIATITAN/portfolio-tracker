import { ipcMain } from 'electron'
import * as historicalRepo from '../db/historicalRepo'
import * as etfCompositionRepo from '../db/etfCompositionRepo'

export function registerHistoricalHandlers(): void {
  ipcMain.handle('historical:list', () => ({
    prices: historicalRepo.listAllHistoricalPrices(),
    fxRates: historicalRepo.listAllHistoricalFxRates()
  }))

  ipcMain.handle('etfComposition:list', () => etfCompositionRepo.listAll())
}
