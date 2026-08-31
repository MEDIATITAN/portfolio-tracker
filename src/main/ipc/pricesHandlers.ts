import { ipcMain } from 'electron'
import * as priceCacheRepo from '../db/priceCacheRepo'
import * as fxRepo from '../db/fxRepo'
import * as priceService from '../services/priceService'
import * as yahooService from '../services/yahooService'
import * as coingeckoService from '../services/coingeckoService'
import type { AssetClass, SymbolQuote } from '../../shared/types'

export function registerPricesHandlers(): void {
  ipcMain.handle('prices:getAll', () => priceCacheRepo.listPriceCache())

  ipcMain.handle('fx:getAll', () => fxRepo.listFxRates())

  ipcMain.handle('prices:refreshAll', () => priceService.refreshAll())

  // Live-Kurse für die Suchvorschläge. Wird bewusst NICHT im Suchergebnis selbst mitgeliefert
  // (Yahoos Such-Endpunkt kennt keine Kurse, ein zusätzlicher Batch-Abruf dauert ~1s) - die Liste
  // erscheint sofort und die Kurse werden nachgereicht. Fehler sind hier unkritisch: ohne Kurs
  // fehlt nur die Zusatzinfo, die Auswahl funktioniert weiterhin.
  ipcMain.handle('prices:getQuotes', async (_event, assetClass: AssetClass, identifiers: string[]) => {
    if (identifiers.length === 0) return []
    try {
      if (assetClass === 'CRYPTO') {
        const prices = await coingeckoService.getPricesEur(identifiers)
        return prices.map((p) => ({ identifier: p.identifier, price: p.price, currency: 'EUR' }) satisfies SymbolQuote)
      }
      if (assetClass === 'STOCK_ETF' || assetClass === 'COMMODITY') {
        return await yahooService.getQuotes(identifiers)
      }
      return []
    } catch (err) {
      console.error('Kurse für Suchvorschläge konnten nicht geladen werden:', err)
      return []
    }
  })
}
