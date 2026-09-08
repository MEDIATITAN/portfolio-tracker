import { ipcMain } from 'electron'
import * as priceCacheRepo from '../db/priceCacheRepo'
import * as fxRepo from '../db/fxRepo'
import * as priceService from '../services/priceService'
import * as yahooService from '../services/yahooService'
import * as coingeckoService from '../services/coingeckoService'
import * as onvistaService from '../services/onvistaService'
import { bondIsin } from '../../shared/bonds'
import type { DisplayClass } from '../../shared/displayClass'
import type { SymbolQuote } from '../../shared/types'

export function registerPricesHandlers(): void {
  ipcMain.handle('prices:getAll', () => priceCacheRepo.listPriceCache())

  ipcMain.handle('fx:getAll', () => fxRepo.listFxRates())

  ipcMain.handle('prices:refreshAll', () => priceService.refreshAll())

  // Live-Kurse für die Suchvorschläge. Wird bewusst NICHT im Suchergebnis selbst mitgeliefert
  // (Yahoos Such-Endpunkt kennt keine Kurse, ein zusätzlicher Batch-Abruf dauert ~1s) - die Liste
  // erscheint sofort und die Kurse werden nachgereicht. Fehler sind hier unkritisch: ohne Kurs
  // fehlt nur die Zusatzinfo, die Auswahl funktioniert weiterhin.
  ipcMain.handle('prices:getQuotes', async (_event, kind: DisplayClass, identifiers: string[]) => {
    if (identifiers.length === 0) return []
    try {
      if (kind === 'BOND') {
        // Kein Sammelabruf bei onvista - je Anleihe eine Anfrage. In den Suchvorschlägen stehen
        // höchstens eine Handvoll Treffer, das bleibt vertretbar.
        const quotes = await Promise.all(
          identifiers.map(async (identifier): Promise<SymbolQuote | null> => {
            const isin = bondIsin(identifier)
            if (!isin) return null
            const quote = await onvistaService.getBondQuote(isin)
            return quote ? { identifier, price: quote.price, currency: quote.currency } : null
          })
        )
        return quotes.filter((q): q is SymbolQuote => q !== null)
      }
      const assetClass = kind
      if (assetClass === 'CRYPTO') {
        const prices = await coingeckoService.getPricesEur(identifiers)
        return prices.map(
          (p) =>
            ({ identifier: p.identifier, price: p.price, currency: 'EUR' }) satisfies SymbolQuote
        )
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
