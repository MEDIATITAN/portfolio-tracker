import * as positionsRepo from '../db/positionsRepo'
import * as transactionsRepo from '../db/transactionsRepo'
import * as yahooService from './yahooService'
import * as wknService from './wknService'
import * as ledgerService from './ledgerService'
import * as priceService from './priceService'
import { resolveToTicker } from './openFigiService'
import type { BrokerFormat, CsvImportProgressEvent, CsvImportResult, SymbolSearchResult, TransactionType } from '../../shared/types'

interface ParsedTransactionRow {
  name: string
  isin: string
  wkn: string
  type: TransactionType
  quantity: number
  price: number
  currency: string
  date: string
}

/** Deutsches Zahlenformat: Punkt = Tausendertrenner, Komma = Dezimaltrennzeichen (z.B. "1.844,00"). */
function parseGermanNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed.replace(/\./g, '').replace(',', '.'))
  return Number.isNaN(value) ? null : value
}

function parseGermanDate(raw: string): string {
  const [d, m, y] = raw.trim().split('.')
  return `${y}-${m}-${d}`
}

/**
 * finanzen.net Zero Orderübersicht-Export: Semikolon-getrennt, deutsches Zahlen-/Datumsformat, mit
 * UTF-8-BOM am Dateianfang (Windows-Export-typisch - muss vor dem Parsen entfernt werden, sonst
 * bricht der Spaltenname der ersten Spalte "Name" -> "﻿Name" und jede Zeilen-Lookup schlägt
 * fehl). Live an einer echten Beispieldatei verifiziert, nicht geraten.
 */
function parseFinanzenZeroCsv(csvText: string): ParsedTransactionRow[] {
  const text = csvText.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []

  const header = lines[0].split(';')
  const col = (name: string): number => header.indexOf(name)
  const iName = col('Name')
  const iIsin = col('ISIN')
  const iWkn = col('WKN')
  const iStatus = col('Status')
  const iRichtung = col('Richtung')
  const iAusfDatum = col('Ausführung Datum')
  const iAusfKurs = col('Ausführung Kurs')
  const iAnzahlAusgefuehrt = col('Anzahl ausgeführt')

  if ([iName, iIsin, iWkn, iStatus, iRichtung, iAusfDatum, iAusfKurs, iAnzahlAusgefuehrt].some((i) => i === -1)) {
    throw new Error('CSV-Format nicht erkannt - erwartete Spalten von finanzen.net Zero fehlen.')
  }

  const out: ParsedTransactionRow[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(';')
    if (cols[iStatus] !== 'ausgeführt') continue
    const quantity = parseGermanNumber(cols[iAnzahlAusgefuehrt])
    const price = parseGermanNumber(cols[iAusfKurs])
    if (quantity === null || price === null || quantity <= 0) continue
    out.push({
      name: cols[iName],
      isin: cols[iIsin],
      wkn: cols[iWkn],
      type: cols[iRichtung] === 'Kauf' ? 'BUY' : 'SELL',
      quantity,
      price,
      currency: 'EUR',
      date: parseGermanDate(cols[iAusfDatum])
    })
  }
  return out
}

function parseCsv(broker: BrokerFormat, csvText: string): ParsedTransactionRow[] {
  if (broker === 'FINANZEN_ZERO') return parseFinanzenZeroCsv(csvText)
  throw new Error(`Unbekanntes Broker-Format: ${broker}`)
}

/**
 * Löst ISIN/WKN/Name in einen Yahoo-Identifier auf - dieselbe Verkettung wie beim WKN-Suchfeld,
 * nur erweitert um ISIN als ersten (meist erfolgreichen) Versuch. Live gegen eine echte Order-CSV
 * getestet: 31 von 32 Wertpapieren lösten sich direkt oder über ISIN auf, nur eins brauchte den
 * WKN-Umweg. Nicht auflösbar sind i.d.R. Hebelprodukte/Zertifikate, die Yahoo nicht als
 * EQUITY/ETF führt - das ist erwartetes Verhalten, keine fehlerhafte Suche.
 */
async function resolveSecurity(isin: string, wkn: string, name: string): Promise<SymbolSearchResult | null> {
  const direct = await yahooService.searchSymbols(isin, 'STOCK_ETF')
  if (direct.length > 0) return direct[0]

  const isinMatch = await resolveToTicker('ID_ISIN', isin)
  if (isinMatch) {
    const bySymbol = await yahooService.searchSymbols(isinMatch.ticker, 'STOCK_ETF')
    if (bySymbol.length > 0) return bySymbol[0]
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
  const rows = parseCsv(broker, csvText)
  const uniqueSecurities = [...new Map(rows.map((r) => [r.isin, r])).values()]

  const resolvedByIsin = new Map<string, SymbolSearchResult | null>()
  const unresolved: { name: string; isin: string }[] = []

  for (let i = 0; i < uniqueSecurities.length; i++) {
    const sec = uniqueSecurities[i]
    onProgress({ rowIndex: i, totalRows: uniqueSecurities.length, name: sec.name, status: 'resolving' })
    const result = await resolveSecurity(sec.isin, sec.wkn, sec.name)
    resolvedByIsin.set(sec.isin, result)
    if (!result) unresolved.push({ name: sec.name, isin: sec.isin })
    onProgress({ rowIndex: i, totalRows: uniqueSecurities.length, name: sec.name, status: result ? 'matched' : 'unresolved' })
  }

  // Nach aufgelöstem Identifier gruppieren (mehrere ISINs könnten theoretisch auf denselben
  // Identifier zeigen, z.B. unterschiedliche Klassen derselben Aktie) und pro Gruppe chronologisch
  // sortieren, damit sowohl die Eröffnungsdatum-Wahl als auch die spätere FIFO-Berechnung stimmen.
  const groups = new Map<string, { resolved: SymbolSearchResult; rows: ParsedTransactionRow[] }>()
  for (const row of rows) {
    const resolved = resolvedByIsin.get(row.isin)
    if (!resolved) continue
    const key = resolved.identifier
    const group = groups.get(key)
    if (group) group.rows.push(row)
    else groups.set(key, { resolved, rows: [row] })
  }

  const existingByIdentifier = new Map(positionsRepo.listPositions().map((p) => [p.identifier, p] as const))
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
        positionsRepo.updatePosition({ id: position.id, sector: profile.sector, region: profile.region })
      }
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
