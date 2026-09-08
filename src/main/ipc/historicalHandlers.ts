import { ipcMain } from 'electron'
import * as historicalRepo from '../db/historicalRepo'
import * as intradayRepo from '../db/intradayRepo'
import * as etfCompositionRepo from '../db/etfCompositionRepo'

export function registerHistoricalHandlers(): void {
  ipcMain.handle('historical:list', () => ({
    prices: historicalRepo.listAllHistoricalPrices(),
    fxRates: historicalRepo.listAllHistoricalFxRates(),
    intraday: intradayRepo.listAllIntradayPrices()
  }))

  ipcMain.handle('etfComposition:list', () => etfCompositionRepo.listAll())
}
