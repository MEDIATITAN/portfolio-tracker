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
      const bySymbol = await wknService.searchResolved(isinMatch, 'STOCK_ETF')
      if (bySymbol.length > 0) return bySymbol[0]
    }
  }

  if (wkn) {
    const wknMatch = await wknService.resolveWknToTicker(wkn)
    if (wknMatch) {
      const bySymbol = await wknService.searchResolved(wknMatch, 'STOCK_ETF')
      if (bySymbol.length > 0) return bySymbol[0]
    }
  }

  const byName = await yahooService.searchSymbols(name, 'STOCK_ETF')
  if (byName.length > 0) return byName[0]

  return null
}

/**
 * Erkennungsmerkmal einer Buchung innerhalb einer Position: Art, Datum, Stückzahl, Preis und
 * Währung. Zahlen werden gerundet, damit unterschiedliche Schreibweisen derselben Buchung
 * ("1.5" gegen "1.50") zusammenfallen - die Genauigkeit reicht weit über alles hinaus, was
 * zwei verschiedene Ausführungen unterscheiden würde.
 */
function bookingKey(t: {
  type: 'BUY' | 'SELL'
  date: string
  quantity: number
  price: number
  currency: string
}): string {
  return [t.type, t.date, t.quantity.toFixed(8), t.price.toFixed(6), t.currency].join('|')
}

/**
 * Zählt die vorhandenen Buchungen einer Position je Erkennungsmerkmal.
 *
 * Bewusst als ZÄHLUNG und nicht als bloße Ja/Nein-Prüfung: eine Order kann in zwei
 * Teilausführungen zum selben Preis am selben Tag zerfallen, und beide gehören ins Depot.
 * Enthält die Datei eine Buchung zweimal und die Datenbank sie einmal, wird genau eine
 * ergänzt - beim erneuten Einlesen derselben Datei dagegen keine.
 */
function existingBookings(positionId: number): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of transactionsRepo.listTransactionsByPosition(positionId)) {
    const key = bookingKey(t)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
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

  // Zuordnung zu bestehenden Positionen: ERST über die ISIN, dann über das Kürzel. Nur über das
  // Kürzel zu gehen war zu eng - die Wertpapiersuche liefert je nach Anfrage einen anderen
  // Börsenplatz desselben Papiers ("IWDA.L" gegen "IWDA.AS"), wodurch derselbe ETF aus zwei
  // Broker-Dateien als zwei Positionen anlegte.
  const existingPositions = positionsRepo.listPositions()
  const existingByIsin = new Map(
    existingPositions.filter((p) => p.isin).map((p) => [p.isin as string, p] as const)
  )
  const existingByIdentifier = new Map(existingPositions.map((p) => [p.identifier, p] as const))
  let transactionsImported = 0
  let duplicatesSkipped = 0
  let planBookingsReplaced = 0
  const affectedPositionIds: number[] = []

  for (const [identifier, group] of groups) {
    const sortedRows = [...group.rows].sort((a, b) => a.date.localeCompare(b.date))
    const fileIsin = sortedRows.find((r) => r.isin)?.isin ?? ''
    let position =
      (fileIsin ? existingByIsin.get(fileIsin) : undefined) ??
      existingByIdentifier.get(identifier) ??
      null

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
        cashType: null,
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

    // Schon vorhandene Buchungen nicht erneut anlegen. Ohne das verdoppelt ein zweites
    // Einlesen derselben Datei den kompletten Bestand.
    const alreadyThere = existingBookings(position.id)
    for (const row of sortedRows) {
      const key = bookingKey(row)
      const seen = alreadyThere.get(key) ?? 0
      if (seen > 0) {
        alreadyThere.set(key, seen - 1)
        duplicatesSkipped++
        continue
      }
      // Die echte Abrechnung ersetzt die Vormerkung des Sparplans für denselben Monat, statt
      // sie zu verdoppeln. Der Sparplan bucht mit dem Tageskurs zum eingestellten Termin; der
      // Broker führt ein paar Tage daneben und zu einem anderen Kurs aus, weshalb die
      // Doppelungserkennung oben hier nicht greifen kann.
      if (
        row.type === 'BUY' &&
        transactionsRepo.deletePlanBookingInMonth(position.id, row.date.slice(0, 7))
      ) {
        planBookingsReplaced++
      }
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

  // Nach dem Import zusammenführen: Positionen aus FRÜHEREN Importen können dasselbe Papier unter
  // einem anderen Börsenplatz führen. Die Zuordnung oben verhindert nur neue Doppelungen.
  const dedupe = ledgerService.mergeDuplicatePositions()
  if (dedupe.merged > 0) console.log('Zusammengeführte Positionen:', dedupe.removed.join(', '))

  // Nur noch vorhandene Positionen nachbearbeiten: Das Zusammenführen oben kann eine der eben
  // bearbeiteten Positionen entfernt haben - getPositionById würde darauf mit einem Fehler
  // abbrechen und den gesamten Import scheitern lassen, obwohl die Buchungen längst geschrieben sind.
  const stillExisting = new Set(positionsRepo.listPositions().map((p) => p.id))
  const toRefresh = [...new Set(affectedPositionIds)].filter((id) => stillExisting.has(id))

  for (const positionId of toRefresh) {
    ledgerService.recomputePosition(positionId)
    await priceService.ensureHistoricalData(positionsRepo.getPositionById(positionId))
  }
  if (toRefresh.length > 0) {
    await priceService.refreshAll()
  }

  return {
    transactionsImported,
    positionsAffected: toRefresh.length,
    duplicatesSkipped,
    planBookingsReplaced,
    unresolved
  }
}
