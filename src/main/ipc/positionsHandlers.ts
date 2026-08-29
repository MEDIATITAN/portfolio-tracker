import { ipcMain } from 'electron'
import * as positionsRepo from '../db/positionsRepo'
import * as yahooService from '../services/yahooService'
import * as coingeckoService from '../services/coingeckoService'
import * as priceService from '../services/priceService'
import * as wknService from '../services/wknService'
import type { AssetClass, NewPosition, PositionUpdate, SymbolSearchResult } from '../../shared/types'

export function registerPositionsHandlers(): void {
  ipcMain.handle('positions:list', () => positionsRepo.listPositions())

  ipcMain.handle('positions:create', async (_event, input: NewPosition) => {
    const position = positionsRepo.createPosition(input)
    await priceService.ensureHistoricalData(position)
    return position
  })

  ipcMain.handle('positions:update', async (_event, input: PositionUpdate) => {
    const position = positionsRepo.updatePosition(input)
    await priceService.ensureHistoricalData(position)
    return position
  })

  ipcMain.handle('positions:delete', (_event, id: number) => {
    positionsRepo.deletePosition(id)
  })

  ipcMain.handle('positions:lookupSymbol', async (_event, assetClass: AssetClass, query: string) => {
    if (assetClass === 'CRYPTO') return coingeckoService.searchCoins(query)
    if (assetClass === 'COMMODITY') return yahooService.searchSymbols(query, assetClass)

    if (assetClass === 'STOCK_ETF') {
      const direct = await yahooService.searchSymbols(query, assetClass)
      if (direct.length > 0 || !wknService.looksLikeWkn(query)) return direct

      // Direkte Suche (Ticker/Name) erfolglos, sieht aber wie eine WKN aus: über OpenFIGI in
      // Ticker/Firmenname auflösen und damit erneut bei Yahoo suchen - Yahoo kennt WKNs selbst nicht.
      const resolved = await wknService.resolveWknToTicker(query.trim())
      if (!resolved) return []
      const byTicker = await yahooService.searchSymbols(resolved.ticker, assetClass)
      const results: SymbolSearchResult[] = byTicker.length > 0 ? byTicker : await yahooService.searchSymbols(resolved.name, assetClass)
      return results
    }

    return []
  })

  ipcMain.handle('positions:getAssetProfile', (_event, identifier: string) => yahooService.getAssetProfile(identifier))
}
