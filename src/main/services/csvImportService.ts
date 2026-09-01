import * as positionsRepo from '../db/positionsRepo'
import * as transactionsRepo from '../db/transactionsRepo'
import * as yahooService from './yahooService'
import * as wknService from './wknService'
import * as ledgerService from './ledgerService'
import * as priceService from './priceService'
import { resolveToTicker } from './openFigiService'
import { parseBrokerCsv, type ParsedTransactionRow } from './csvFormats'
import type {
  BrokerFormat,
  CsvImportProgressEvent,
  CsvImportResult,
  SymbolSearchResult
} from '../../shared/types'

/**
 * Löst ISIN/WKN/Name in einen Yahoo-Identifier auf - dieselbe Verkettung wie beim WKN-Suchfeld,
 * nur erweitert um ISIN als ersten (meist erfolgreichen) Versuch. Live gegen eine echte Order-CSV
 * getestet: 31 von 32 Wertpapieren lösten sich direkt oder über ISIN auf, nur eins brauchte den
 * WKN-Umweg. Nicht auflösbar sind i.d.R. Hebelprodukte/Zertifikate, die Yahoo nicht als
 * EQUITY/ETF führt - das ist erwartetes Verhalten, keine fehlerhafte Suche.
 *
 * Die ISIN-Schritte sind übersprungen, wenn keine vorliegt: eine Suche mit leerem Text liefert
 * beliebige Treffer und würde dem Wertpapier ein falsches Kürzel zuordnen.
 */
async function resolveSecurity(
  isin: string,
  wkn: string,
  name: string
): Promise<SymbolSearchResult | null> {
  if (isin) {
    const direct = await yahooService.searchSymbols(isin, 'STOCK_ETF')
    if (direct.length > 0) return direct[0]

    const isinMatch = await resolveToTicker('ID_ISIN', isin)
    if (isinMatch) {
      const bySymbol = await yahooService.searchSymbols(isinMatch.ticker, 'STOCK_ETF')
      if (bySymbol.length > 0) return bySymbol[0]
    }
  }

  if (wkn) {
    const wknMatch = await wknService.resolveWknToTicker(wkn)
    if (wknMatch) {
      const bySymbol = await yahooService.searchSymbols(wknMatch.ticker, 'STOCK_ETF')
      if (bySymbol.length > 0) return bySymbol[0]
    }
  }

  const byName = await yahooService.searchSymbols(name, 'STOCK_ETF')
  if (byName.length > 0) return byName[0]

  return null
}

export async function importCsv(
  broker: BrokerFormat,
  csvText: string,
  onProgress: (event: CsvImportProgressEvent) => void
): Promise<CsvImportResult> {
  const rows = parseBrokerCsv(csvText)
  // Schlüssel je Wertpapier: bevorzugt die ISIN, sonst der Name. Ausschließlich über die ISIN zu
  // gruppieren war falsch - liefert ein Export keine, fielen ALLE Buchungen auf denselben leeren
  // Schlüssel und wurden zu einer einzigen, falschen Position verschmolzen.
  const securityKey = (row: ParsedTransactionRow): string => row.isin || row.name
  const uniqueSecurities = [...new Map(rows.map((r) => [securityKey(r), r])).values()]

  const resolvedByKey = new Map<string, SymbolSearchResult | null>()
  const unresolved: { name: string; isin: string }[] = []

  for (let i = 0; i < uniqueSecurities.length; i++) {
    const sec = uniqueSecurities[i]
    onProgress({
      rowIndex: i,
      totalRows: uniqueSecurities.length,
      name: sec.name,
      status: 'resolving'
    })
    const result = await resolveSecurity(sec.isin, sec.wkn, sec.name)
    resolvedByKey.set(securityKey(sec), result)
    if (!result) unresolved.push({ name: sec.name, isin: sec.isin })
    onProgress({
      rowIndex: i,
      totalRows: uniqueSecurities.length,
      name: sec.name,
      status: result ? 'matched' : 'unresolved'
    })
  }

  // Nach aufgelöstem Identifier gruppieren (mehrere ISINs könnten theoretisch auf denselben
  // Identifier zeigen, z.B. unterschiedliche Klassen derselben Aktie) und pro Gruppe chronologisch
  // sortieren, damit sowohl die Eröffnungsdatum-Wahl als auch die spätere FIFO-Berechnung stimmen.
  const groups = new Map<string, { resolved: SymbolSearchResult; rows: ParsedTransactionRow[] }>()
  for (const row of rows) {
    const resolved = resolvedByKey.get(securityKey(row))
    if (!resolved) continue
    const key = resolved.identifier
    const group = groups.get(key)
    if (group) group.rows.push(row)
    else groups.set(key, { resolved, rows: [row] })
  }

  const existingByIdentifier = new Map(
    positionsRepo.listPositions().map((p) => [p.identifier, p] as const)
  )
  let transactionsImported = 0
  const affectedPositionIds: number[] = []

  for (const [identifier, group] of groups) {
    const sortedRows = [...group.rows].sort((a, b) => a.date.localeCompare(b.date))
    let position = existingByIdentifier.get(identifier) ?? null

    if (!position) {
      position = positionsRepo.createPosition({
        assetClass: 'STOCK_ETF',
        securityType: group.resolved.securityType,
        name: group.resolved.name,
        symbol: group.resolved.symbol,
        identifier,
        // Die ISIN aus der Broker-Datei ist die verlässlichste Quelle, die wir je bekommen -
        // eindeutig und ohne Namensraterei. Sie wird für die ETF-Länderaufteilung gebraucht.
        isin: sortedRows[0].isin || null,
        quantity: 0,
        quantityUnit: null,
        currency: sortedRows[0].currency,
        avgCostBasis: null,
        manualValue: null,
        sector: group.resolved.sector,
        region: group.resolved.region,
        subType: null,
        purchaseDate: sortedRows[0].date,
        notes: null
      })
      if (group.resolved.securityType === 'STOCK') {
        const profile = await yahooService.getAssetProfile(identifier)
        positionsRepo.updatePosition({
          id: position.id,
          sector: profile.sector,
          region: profile.region
        })
      }
    } else if (!position.isin && sortedRows[0].isin) {
      // Bestandsposition aus der Zeit vor der ISIN-Spalte: aus der Datei nachtragen.
      position = positionsRepo.updatePosition({ id: position.id, isin: sortedRows[0].isin })
    }

    for (const row of sortedRows) {
      transactionsRepo.createTransaction({
        positionId: position.id,
        type: row.type,
        quantity: row.quantity,
        price: row.price,
        currency: row.currency,
        date: row.date,
        broker,
        notes: null
      })
      transactionsImported++
    }
    affectedPositionIds.push(position.id)
  }

  for (const positionId of affectedPositionIds) {
    ledgerService.recomputePosition(positionId)
    await priceService.ensureHistoricalData(positionsRepo.getPositionById(positionId))
  }
  if (affectedPositionIds.length > 0) {
    await priceService.refreshAll()
  }

  return {
    transactionsImported,
    positionsAffected: affectedPositionIds.length,
    unresolved
  }
}
