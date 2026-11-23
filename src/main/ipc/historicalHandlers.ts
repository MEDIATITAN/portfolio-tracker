import { handle } from './handle'
import * as historicalRepo from '../db/historicalRepo'
import * as intradayRepo from '../db/intradayRepo'
import * as etfCompositionRepo from '../db/etfCompositionRepo'

export function registerHistoricalHandlers(): void {
  handle('historical:list', () => ({
    prices: historicalRepo.listAllHistoricalPrices(),
    fxRates: historicalRepo.listAllHistoricalFxRates(),
    intraday: intradayRepo.listAllIntradayPrices()
  }))

  handle('etfComposition:list', () => etfCompositionRepo.listAll())
}
