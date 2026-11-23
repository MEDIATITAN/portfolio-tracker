import { handle } from './handle'
import * as positionsRepo from '../db/positionsRepo'
import * as snapshotsRepo from '../db/snapshotsRepo'
import * as cashBalanceRepo from '../db/cashBalanceRepo'
import * as cashBalanceService from '../services/cashBalanceService'
import * as yahooService from '../services/yahooService'
import * as coingeckoService from '../services/coingeckoService'
import * as priceService from '../services/priceService'
import * as wknService from '../services/wknService'
import * as onvistaService from '../services/onvistaService'
import { bondIdentifier } from '../../shared/bonds'
import type { DisplayClass } from '../../shared/displayClass'
import type {
  AssetClass,
  NewPosition,
  PositionUpdate,
  SymbolSearchResult
} from '../../shared/types'

export function registerPositionsHandlers(): void {
  handle('positions:list', () => positionsRepo.listPositions())
  // Der Kontostands-Verlauf gehört zu den Positionen: er wird in deren Liste aufgeklappt.
  handle('cashHistory:list', () => cashBalanceRepo.listAll())

  handle('positions:create', async (_event, input: NewPosition) => {
    const position = positionsRepo.createPosition(input)
    cashBalanceService.recordBalanceChange(null, position, 'MANUAL')
    await priceService.ensureHistoricalData(position)
    return position
  })

  handle('positions:update', async (_event, input: PositionUpdate) => {
    // Den alten Stand VOR dem Schreiben lesen: nur so lässt sich erkennen, ob sich am Kontostand
    // eines Guthabens etwas geändert hat oder nur Name oder Notiz.
    const before = positionsRepo.getPositionById(input.id)
    const position = positionsRepo.updatePosition(input)
    cashBalanceService.recordBalanceChange(before, position, 'MANUAL')
    await priceService.ensureHistoricalData(position)
    return position
  })

  handle('positions:delete', (_event, id: number) => {
    positionsRepo.deletePosition(id)
  })

  // Löscht wirklich ALLE Positionen (Transaktionen kaskadieren über die FK) UND den kompletten
  // Snapshot-Verlauf (sonst würde "Vermögen über Zeit" weiter alte, jetzt bedeutungslose reale
  // Werte zeigen - gleiche Überlegung wie beim "Zurücksetzen"-Button, hier nur zusätzlich mit
  // Löschen der Positionen selbst).
  handle('positions:deleteAll', () => {
    positionsRepo.deleteAllPositions()
    snapshotsRepo.deleteAllSnapshots()
  })

  handle('positions:lookupSymbol', async (_event, kind: DisplayClass, query: string) => {
    // Anleihen: onvista findet sie über WKN, ISIN oder Namen. Yahoo führt einzelne Anleihen
    // überhaupt nicht - weder über ISIN noch über die Kürzel der deutschen Börsenplätze.
    if (kind === 'BOND') {
      const hits = await onvistaService.searchBonds(query)
      return hits.map((h): SymbolSearchResult => ({
        identifier: bondIdentifier(h.isin),
        symbol: h.wkn,
        name: h.name,
        exchange: null,
        securityType: null,
        // Währung und Kurs kommen erst beim Abruf der Notierung - die Suche gibt sie nicht heraus.
        currency: null,
        sector: null,
        region: null
      }))
    }

    const assetClass: AssetClass = kind
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
      const results: SymbolSearchResult[] =
        byTicker.length > 0 ? byTicker : await yahooService.searchSymbols(resolved.name, assetClass)
      return results
    }

    return []
  })

  handle('positions:getAssetProfile', (_event, identifier: string) =>
    yahooService.getAssetProfile(identifier)
  )
}
