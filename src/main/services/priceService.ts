import * as positionsRepo from '../db/positionsRepo'
import * as priceCacheRepo from '../db/priceCacheRepo'
import * as fxRepo from '../db/fxRepo'
import * as snapshotsRepo from '../db/snapshotsRepo'
import * as settingsRepo from '../db/settingsRepo'
import * as historicalRepo from '../db/historicalRepo'
import * as etfCompositionService from './etfCompositionService'
import * as yahooService from './yahooService'
import * as coingeckoService from './coingeckoService'
import * as binanceService from './binanceService'
import * as fxService from './fxService'
import { computeAllPositionValues, sumByAssetClass, sumTotalEur } from '../../shared/valueCalc'
import type {
  AssetClass,
  Position,
  RefreshResult,
  ResetProgressEvent,
  SnapshotItem
} from '../../shared/types'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function refreshAll(): Promise<RefreshResult> {
  const identifiers = positionsRepo.listDistinctIdentifiers()
  const stockEtfCommodityIds = identifiers
    .filter((i) => i.assetClass === 'STOCK_ETF' || i.assetClass === 'COMMODITY')
    .map((i) => i.identifier)
  const cryptoIds = identifiers.filter((i) => i.assetClass === 'CRYPTO').map((i) => i.identifier)

  const failedIdentifiers: string[] = []
  const now = new Date().toISOString()
  let updatedCount = 0

  // Yahoo Finance: Aktien, ETFs, Rohstoffe - ein Batch-Call für alle Identifier dieser Klassen.
  if (stockEtfCommodityIds.length > 0) {
    try {
      const quotes = await yahooService.getQuotes(stockEtfCommodityIds)
      const found = new Set(quotes.map((q) => q.identifier))
      for (const quote of quotes) {
        const assetClass =
          identifiers.find((i) => i.identifier === quote.identifier)?.assetClass ?? 'STOCK_ETF'
        priceCacheRepo.upsertPrice({
          identifier: quote.identifier,
          assetClass,
          price: quote.price,
          currency: quote.currency,
          fetchedAt: now
        })
        updatedCount++
      }
      for (const id of stockEtfCommodityIds) {
        if (!found.has(id)) {
          failedIdentifiers.push(id)
          priceCacheRepo.markPriceFetchError(id, 'Kein Kurs von Yahoo Finance erhalten')
        }
      }
    } catch (err) {
      failedIdentifiers.push(...stockEtfCommodityIds)
      const message = errorMessage(err, 'Unbekannter Fehler bei Yahoo Finance')
      for (const id of stockEtfCommodityIds) priceCacheRepo.markPriceFetchError(id, message)
    }
  }

  // CoinGecko: Krypto - ein Batch-Call, Preise direkt in EUR (keine FX-Umrechnung nötig).
  if (cryptoIds.length > 0) {
    try {
      const prices = await coingeckoService.getPricesEur(cryptoIds)
      const found = new Set(prices.map((p) => p.identifier))
      for (const price of prices) {
        priceCacheRepo.upsertPrice({
          identifier: price.identifier,
          assetClass: 'CRYPTO',
          price: price.price,
          currency: 'EUR',
          fetchedAt: now
        })
        updatedCount++
      }
      for (const id of cryptoIds) {
        if (!found.has(id)) {
          failedIdentifiers.push(id)
          priceCacheRepo.markPriceFetchError(id, 'Kein Kurs von CoinGecko erhalten')
        }
      }
    } catch (err) {
      failedIdentifiers.push(...cryptoIds)
      const message = errorMessage(err, 'Unbekannter Fehler bei CoinGecko')
      for (const id of cryptoIds) priceCacheRepo.markPriceFetchError(id, message)
    }
  }

  // Frankfurter: alle Fremdwährungen aus Positionen + frisch abgerufenen Kursen, ein Batch-Call.
  const settings = settingsRepo.getSettings()
  const baseCurrency = settings.baseCurrency
  const positions = positionsRepo.listPositions()
  const priceCacheAfterFetch = priceCacheRepo.listPriceCache()
  const currencies = new Set<string>()
  for (const p of positions) if (p.currency !== baseCurrency) currencies.add(p.currency)
  for (const p of priceCacheAfterFetch) if (p.currency !== baseCurrency) currencies.add(p.currency)

  if (currencies.size > 0) {
    try {
      const rates = await fxService.getRates(baseCurrency, [...currencies])
      for (const rate of rates) {
        fxRepo.upsertFxRate({ base: rate.base, quote: rate.quote, rate: rate.rate, fetchedAt: now })
      }
    } catch {
      // FX-Fehler blockiert den Rest nicht - alte Kurse bleiben im Cache stehen und werden weiterverwendet.
    }
  }

  // Fondszusammensetzung + Einstufung physischer Rohstoff-ETCs pflegen. Beides ist intern
  // gecacht/idempotent (Zusammensetzung max. wöchentlich, Umstufung nur solange Kandidaten übrig
  // sind), läuft hier also im Normalfall ohne zusätzliche Netzwerklast mit.
  try {
    await etfCompositionService.reclassifyCommodityEtcs()
    await etfCompositionService.reclassifyBondEtfs()
    for (const position of positionsRepo.listPositions()) {
      await etfCompositionService.ensureComposition(position)
    }
  } catch (err) {
    console.error('ETF-Zusammensetzung konnte nicht aktualisiert werden:', err)
  }

  // Snapshot des Gesamtwerts + Aufteilung je Anlageklasse schreiben - aber nur, wenn überhaupt
  // Positionen existieren. Ein Snapshot mit Wert 0 bei (temporär) leerem Portfolio (z.B. während
  // eine Position gelöscht und direkt danach neu angelegt wird) wäre kein echter historischer
  // Zustand, sondern nur ein Zwischenstand - würde aber dauerhaft als Einbruch auf 0 im
  // "Vermögen über Zeit"-Chart stehen bleiben.
  let snapshotId: number | null = null
  if (positions.length > 0) {
    const freshPriceCache = priceCacheRepo.listPriceCache()
    const freshFxRates = fxRepo.listFxRates()
    // Bewusst neu einlesen: die Umstufung oben kann Anlageklassen geändert haben, und der Snapshot
    // speichert die Aufteilung JE ANLAGEKLASSE - mit der alten Liste wäre sie sofort veraltet.
    const values = computeAllPositionValues(
      positionsRepo.listPositions(),
      freshPriceCache,
      freshFxRates
    )
    const totalValueEur = sumTotalEur(values)
    const byAssetClass = sumByAssetClass(values)
    const items: SnapshotItem[] = (Object.entries(byAssetClass) as [AssetClass, number][]).map(
      ([assetClass, valueEur]) => ({ assetClass, valueEur })
    )
    snapshotId = snapshotsRepo.createSnapshot(now, totalValueEur, items)
  }

  return { updatedCount, failedIdentifiers, snapshotId }
}

/** Deckt eine Kursreihe den gesuchten Zeitraum ab? */
function covers(points: { date: string }[], fromDate: string): boolean {
  return points.length > 0 && points[0].date <= fromDate
}

/**
 * Rechnet USDT-Kurse in Euro um.
 *
 * Wichtig dabei: Krypto wird an sieben Tagen die Woche gehandelt, Wechselkurse gibt es nur an
 * Bankarbeitstagen. Für Samstage, Sonntage und Feiertage wird deshalb der zuletzt bekannte Kurs
 * fortgeschrieben - ohne das fielen rund zwei von sieben Tagen aus der Reihe heraus.
 */
async function usdtToEur(
  points: { date: string; price: number }[]
): Promise<{ date: string; price: number }[]> {
  if (points.length === 0) return []
  const rates = await fxService.getHistoricalRates('EUR', 'USD', points[0].date)
  const byDate = new Map(rates.map((r) => [r.date, r.rate]))

  const out: { date: string; price: number }[] = []
  let lastRate: number | null = null
  for (const p of points) {
    lastRate = byDate.get(p.date) ?? lastRate
    if (lastRate !== null && lastRate > 0) out.push({ date: p.date, price: p.price / lastRate })
  }
  return out
}

/**
 * Tageskurse einer Kryptowährung in EUR - aus drei Quellen, in dieser Reihenfolge.
 *
 * Grund für die Reihenfolge: CoinGecko gibt im kostenlosen Tarif nur die letzten 365 Tage heraus
 * (darüber hinaus HTTP 401), wodurch der Wertverlauf davor auf die Einstandspreis-Schätzung
 * zurückfiel - bei einer länger gehaltenen Position also fast durchgehend geschätzt. Yahoo führt
 * dieselben Coins als Währungspaar "<SYMBOL>-EUR" mit über sieben Jahren Tageshistorie; nachgemessen
 * für ADA, BTC, ETH, SOL, XRP, DOGE und BNB (je ~2800 Kurse ab 2019). Die Kurse beider Quellen
 * liegen unter 0,5 % auseinander, es sind also dieselben Daten.
 *
 * Für kleinere Coins wie BONK, PYTH oder TRUMP führt Yahoo kein Paar. Dort greift Binance: dessen
 * öffentliche Schnittstelle liefert ohne Schlüssel Tageskerzen bis zum Listing-Datum, notiert in
 * USDT und hier nach Euro umgerechnet. CoinGecko bleibt der letzte Rückfall und ist weiterhin für
 * Suche und Live-Kurse zuständig - dort ist die Coin-Kennung die verlässliche Größe.
 */
async function cryptoHistory(
  position: Position,
  fromDate: string
): Promise<{ date: string; price: number }[]> {
  const symbol = position.symbol?.trim().toUpperCase()
  // Beste bisher gefundene Reihe, falls keine Quelle bis zum Kaufdatum zurückreicht.
  let best: { date: string; price: number }[] = []
  const remember = (points: { date: string; price: number }[]): void => {
    if (points.length > 0 && (best.length === 0 || points[0].date < best[0].date)) best = points
  }

  if (symbol) {
    try {
      const points = await yahooService.getHistoricalPrices(`${symbol}-EUR`, fromDate)
      // Nur brauchbar, wenn Yahoo das Paar kennt UND in EUR liefert.
      if (points.every((p) => p.currency === 'EUR')) {
        if (covers(points, fromDate)) return points
        remember(points)
      }
    } catch {
      // Paar bei Yahoo unbekannt.
    }

    try {
      const usdt = await binanceService.getHistoricalPricesUsdt(symbol, fromDate)
      const eur = await usdtToEur(usdt)
      if (covers(eur, fromDate)) return eur
      remember(eur)
    } catch {
      // Paar bei Binance unbekannt.
    }
  }

  try {
    const cg = await coingeckoService.getHistoricalPricesEur(position.identifier!, fromDate)
    if (covers(cg, fromDate)) return cg
    remember(cg)
  } catch {
    // CoinGecko nicht erreichbar.
  }

  // Keine Quelle reicht bis zum Kaufdatum - dann die weiteste nehmen, der Rest bleibt geschätzt.
  return best
}

/**
 * Lädt historische Tageskurse für eine Position ab ihrem Kaufdatum (oder, falls keines gesetzt,
 * ab dem Anlegen-Zeitpunkt) nach - für die Rückrechnung im "Vermögen über Zeit"-Chart. Wird beim
 * Anlegen/Bearbeiten einer Position aufgerufen (bewusst langsamer als ein normaler Kursabruf,
 * das ist dem Nutzer bekannt). Fehler hier dürfen das Anlegen/Bearbeiten NICHT blockieren - die
 * historischen Daten sind eine Zusatzfunktion, kein Kernbestandteil.
 */
export async function ensureHistoricalData(position: Position): Promise<void> {
  if (position.assetClass === 'CASH_OTHER' || !position.identifier) return

  const fromDate = (position.purchaseDate ?? position.createdAt).slice(0, 10)
  const alreadyCoveredFrom = historicalRepo.earliestHistoricalDate(position.identifier)
  if (alreadyCoveredFrom !== null && alreadyCoveredFrom <= fromDate) return

  try {
    if (position.assetClass === 'CRYPTO') {
      const points = await cryptoHistory(position, fromDate)
      historicalRepo.upsertHistoricalPrices(
        position.identifier,
        'CRYPTO',
        points.map((p) => ({ date: p.date, price: p.price, currency: 'EUR' }))
      )
      return
    }

    // STOCK_ETF oder COMMODITY
    const points = await yahooService.getHistoricalPrices(position.identifier, fromDate)
    historicalRepo.upsertHistoricalPrices(position.identifier, position.assetClass, points)

    const currency = points[0]?.currency
    if (currency && currency !== 'EUR') {
      const fxPoints = await fxService.getHistoricalRates('EUR', currency, fromDate)
      historicalRepo.upsertHistoricalFxRates('EUR', currency, fxPoints)
    }
  } catch (err) {
    console.error(`Historische Daten für ${position.identifier} konnten nicht geladen werden:`, err)
  }
}

/**
 * Löscht den kompletten Snapshot-Verlauf (das "Vermögen über Zeit"-Chart basiert danach wieder
 * rein auf einer Neuberechnung aus den aktuell eingetragenen Positionen) und baut ihn neu auf:
 * für jede aktuelle Position wird sichergestellt, dass historische Kurse vorliegen (meldet dabei
 * Fortschritt via onProgress, für die Fortschrittsliste im UI), anschließend ein frischer
 * Live-Kursabruf inkl. neuem Snapshot für "heute". Positionen, die zwischenzeitlich gelöscht
 * wurden, tauchen dadurch im Verlauf nicht mehr auf.
 */
export async function resetAndRecalculate(
  onProgress: (event: ResetProgressEvent) => void
): Promise<RefreshResult> {
  snapshotsRepo.deleteAllSnapshots()

  const positions = positionsRepo.listPositions()
  for (const position of positions) {
    onProgress({ positionId: position.id, name: position.name, status: 'processing' })
    await ensureHistoricalData(position)
    onProgress({ positionId: position.id, name: position.name, status: 'done' })
  }

  return refreshAll()
}
