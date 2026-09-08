import * as positionsRepo from '../db/positionsRepo'
import * as priceCacheRepo from '../db/priceCacheRepo'
import * as fxRepo from '../db/fxRepo'
import * as snapshotsRepo from '../db/snapshotsRepo'
import * as settingsRepo from '../db/settingsRepo'
import * as historicalRepo from '../db/historicalRepo'
import * as intradayRepo from '../db/intradayRepo'
import * as etfCompositionService from './etfCompositionService'
import * as yahooService from './yahooService'
import * as coingeckoService from './coingeckoService'
import * as binanceService from './binanceService'
import * as fxService from './fxService'
import * as onvistaService from './onvistaService'
import { bondIdentifier, bondIsin, isBondIdentifier } from '../../shared/bonds'
import { computeAllPositionValues, sumByAssetClass, sumTotalEur } from '../../shared/valueCalc'
import { displayClass, type DisplayClass } from '../../shared/displayClass'
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

/** Merkt sich die Notierungswährung je ISIN, damit ein zweiter Durchlauf keinen Abruf auslöst. */
const bondCurrency = new Map<string, string>()

/**
 * Ergänzt bei einzelnen Anleihen, was sich aus der Notierung ergibt:
 *
 * - das Sitzland des Emittenten, damit sie im Regionen-Diagramm auftauchen
 * - die Währung. Der Nennwert einer Anleihe lautet immer auf ihre eigene Währung: 1.100 bei
 *   einer Dollar-Anleihe sind 1.100 Dollar. Steht in der Position etwas anderes, wird der
 *   Einstandspreis in der falschen Währung gerechnet und der Gewinn stimmt nicht - der Kurs
 *   selbst kommt ja in Dollar. Deshalb hat die Notierung hier Vorrang vor der Eingabe.
 *
 * Abgefragt wird nur, solange etwas fehlt; danach kostet der Durchlauf keinen Abruf mehr.
 */
async function enrichBondPositions(): Promise<void> {
  for (const position of positionsRepo.listPositions()) {
    const isin = bondIsin(position.identifier)
    if (!isin) continue
    if (position.region !== null && position.currency === bondCurrency.get(isin)) continue

    const quote = await onvistaService.getBondQuote(isin)
    if (!quote) continue
    bondCurrency.set(isin, quote.currency)

    const changes: { id: number; region?: string; currency?: string } = { id: position.id }
    if (position.region === null && quote.country) changes.region = quote.country
    if (position.currency !== quote.currency) changes.currency = quote.currency
    if (Object.keys(changes).length > 1) positionsRepo.updatePosition(changes)
  }
}

/**
 * Anleihen, bei denen im Suchfeld nur die WKN steht, ohne dass ein Vorschlag angeklickt wurde:
 * dann ist der Identifier die abgetippte WKN und nicht die Kennung, unter der der Kurs abrufbar
 * ist. Statt den Abruf scheitern zu lassen, wird die WKN einmalig bei onvista aufgelöst und die
 * Position dauerhaft korrigiert.
 *
 * Nur bei EINDEUTIGEN Treffern - bei mehreren bliebe offen, welche Anleihe gemeint ist, und eine
 * falsch zugeordnete Kennung wäre schlimmer als gar keine. Anleihen-ETFs sind nicht betroffen:
 * ihr Kürzel enthält einen Punkt ("DTLE.L") und fällt schon durch die Musterprüfung.
 */
async function resolveBondIdentifiers(): Promise<void> {
  const WKN_OR_ISIN = /^([A-Z0-9]{6}|[A-Z]{2}[A-Z0-9]{9}[0-9])$/
  for (const position of positionsRepo.listPositions()) {
    if (position.subType !== 'BOND' || !position.identifier) continue
    if (isBondIdentifier(position.identifier)) continue
    const candidate = position.identifier.trim().toUpperCase()
    if (!WKN_OR_ISIN.test(candidate)) continue

    const hits = await onvistaService.searchBonds(candidate)
    if (hits.length !== 1) continue
    const hit = hits[0]
    positionsRepo.updatePosition({
      id: position.id,
      identifier: bondIdentifier(hit.isin),
      isin: hit.isin,
      symbol: hit.wkn
    })
    console.log(`Anleihe ${candidate} aufgelöst zu ${hit.wkn} / ${hit.isin} (${hit.name})`)
  }
}

/** So weit reichen die Stundenkurse zurück - deckt den längsten Zeitraum ab, der sie nutzt (1 Woche). */
const INTRADAY_DAYS = 8
/** Häufiger als das lohnt der Abruf nicht: eine Stundenkerze ändert sich frühestens stündlich. */
const INTRADAY_MIN_INTERVAL_MS = 30 * 60 * 1000
const INTRADAY_FETCHED_AT_KEY = 'intraday_fetched_at'

/**
 * Holt Stundenkurse für alle kursbewerteten Positionen und hält sie auf den letzten Tagen.
 *
 * Der Grund: der Wertverlauf für "1 Tag" und "1 Woche" bestand bisher nur aus den Zeitpunkten,
 * zu denen die App gerade offen war. Über Nacht entstand dadurch eine Lücke von vierzehn
 * Stunden. Mit Stundenkursen lässt sich der Verlauf für jede Stunde nachrechnen, unabhängig
 * davon, ob die App lief.
 *
 * Kostet einen Abruf JE Wertpapier (Yahoo und Binance kennen keinen Sammelabruf für
 * Intraday-Daten) - deshalb höchstens alle 30 Minuten und nur für die letzten Tage.
 */
async function ensureIntradayData(): Promise<void> {
  const lastFetch = settingsRepo.getRawSetting(INTRADAY_FETCHED_AT_KEY)
  if (lastFetch && Date.now() - Date.parse(lastFetch) < INTRADAY_MIN_INTERVAL_MS) return

  const fromMs = Date.now() - INTRADAY_DAYS * 24 * 60 * 60 * 1000
  for (const position of positionsRepo.listPositions()) {
    if (position.assetClass === 'CASH_OTHER' || !position.identifier) continue
    if (position.quantity <= 0) continue
    const identifier = position.identifier
    try {
      if (position.assetClass === 'CRYPTO') {
        const symbol = position.symbol ?? identifier
        const usdt = await binanceService.getHourlyPricesUsdt(symbol, fromMs)
        if (usdt.length === 0) continue
        intradayRepo.upsertIntradayPrices(
          identifier,
          'CRYPTO',
          usdt.map((p) => ({ ...p, currency: 'USDT' }))
        )
        continue
      }
      // Einzelne Anleihen kennt nur onvista, und dort gibt es keine Stundenkurse.
      if (isBondIdentifier(identifier)) continue
      const points = await yahooService.getIntradayPrices(identifier, fromMs)
      if (points.length > 0) {
        intradayRepo.upsertIntradayPrices(identifier, position.assetClass, points)
      }
    } catch {
      // Ein Wertpapier ohne Intraday-Daten ist der Normalfall (z.B. Schweizer ETPs) - der
      // Verlauf fällt dort auf den letzten Tagesschlusskurs zurück.
    }
  }

  intradayRepo.pruneIntradayBefore(new Date(fromMs).toISOString())
  settingsRepo.setRawSetting(INTRADAY_FETCHED_AT_KEY, new Date().toISOString())
}

export async function refreshAll(): Promise<RefreshResult> {
  await resolveBondIdentifiers()
  await enrichBondPositions()
  await ensureIntradayData()
  const identifiers = positionsRepo.listDistinctIdentifiers()
  // Einzelne Anleihen tragen ein "BOND:"-Präfix und gehen zu onvista, nicht zu Yahoo - siehe
  // shared/bonds.ts. Anleihen-ETFs sind davon nicht betroffen, die haben ein normales Kürzel.
  const bondIds = identifiers.filter((i) => isBondIdentifier(i.identifier)).map((i) => i.identifier)
  const stockEtfCommodityIds = identifiers
    .filter((i) => i.assetClass === 'STOCK_ETF' || i.assetClass === 'COMMODITY')
    .filter((i) => !isBondIdentifier(i.identifier))
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

  // onvista: einzelne Anleihen. Kein Sammelabruf verfügbar, also eine Anfrage je Anleihe - bei
  // der Anzahl Anleihen in einem Privatdepot ist das unkritisch. Jede Anleihe hat ihr eigenes
  // try/catch: eine nicht mehr notierte darf die übrigen nicht mitreißen.
  for (const identifier of bondIds) {
    const isin = bondIsin(identifier)
    try {
      const quote = isin ? await onvistaService.getBondQuote(isin) : null
      if (!quote) {
        failedIdentifiers.push(identifier)
        priceCacheRepo.markPriceFetchError(identifier, 'Kein Kurs von onvista erhalten')
        continue
      }
      priceCacheRepo.upsertPrice({
        identifier,
        assetClass: 'STOCK_ETF',
        // Bereits je EINER Einheit Nennwert - onvistaService rechnet den Prozentkurs um.
        price: quote.price,
        currency: quote.currency,
        fetchedAt: now
      })
      updatedCount++
    } catch (err) {
      failedIdentifiers.push(identifier)
      priceCacheRepo.markPriceFetchError(
        identifier,
        errorMessage(err, 'Unbekannter Fehler bei onvista')
      )
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

  // Die eben geholten Kurse zusätzlich als HEUTIGEN Punkt in die Verlaufsreihe schreiben.
  // Kostet keinen einzigen zusätzlichen Abruf und hält die Reihen von selbst aktuell - ohne
  // das endete jede Reihe an dem Tag, an dem sie einmal geholt wurde.
  const today = now.slice(0, 10)
  for (const entry of priceCacheRepo.listPriceCache()) {
    if (entry.fetchedAt !== now || entry.fetchError !== null) continue
    historicalRepo.upsertHistoricalPrices(entry.identifier, entry.assetClass, [
      { date: today, price: entry.price, currency: entry.currency }
    ])
  }

  await repairContradictedSeries()

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

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Um welchen Faktor der jüngste Kurs einer Reihe höchstens vom bekannten Live-Kurs abweichen darf.
 * Großzügig gewählt: es geht nicht darum, Tagesschwankungen zu erwischen, sondern eine völlig
 * andere Kryptowährung - dort liegen Faktoren von 10 bis 750 dazwischen.
 */
const REFERENCE_MAX_FACTOR = 4
/** Bis zu welchem Alter der letzte Kurs einer Reihe noch mit dem heutigen verglichen werden darf. */
const REFERENCE_MAX_AGE_DAYS = 4

type PricePoints = { date: string; price: number }[]

/** Gehört die Kursreihe zur gesuchten Kryptowährung? */
type SeriesVerdict =
  /** Jüngster Kurs passt zum Live-Kurs - die Reihe gehört zu dieser Coin. */
  | 'verified'
  /** Reihe endet zu weit in der Vergangenheit, um sie zu prüfen. Brauchbar, aber nur als Notnagel. */
  | 'unverified'
  /** Nachweislich eine andere Coin. */
  | 'wrong'

/**
 * Prüft, ob eine Kursreihe überhaupt zur gesuchten Kryptowährung gehört.
 *
 * Nötig, weil Yahoo und Binance über das SYMBOL angefragt werden ("JUP-USD"), nicht über die
 * eindeutige Coin-ID. Tickerkürzel sind aber nicht eindeutig: hinter Yahoos "JUP-USD" steckt ein
 * anderes Jupiter (0,00032 $) als das gesuchte (0,24 $), hinter "POL-USD" eine 2023 eingestellte
 * "Proof Of Liquidity" statt Polygon. Beide Reihen sahen für den Code einwandfrei aus - richtige
 * Währung, lückenlos, weit genug zurück - und ergaben in der Gewinner/Verlierer-Liste +74.800 %.
 *
 * Der Live-Kurs kommt über die eindeutige Coin-ID und ist damit der einzige verlässliche
 * Anhaltspunkt, welche Coin gemeint ist.
 */
function verifySeries(points: PricePoints, referenceEur: number | null): SeriesVerdict {
  if (points.length === 0) return 'wrong'
  if (referenceEur === null || referenceEur <= 0) return 'unverified'
  const last = points[points.length - 1]
  const ageDays = (Date.now() - Date.parse(`${last.date}T12:00:00Z`)) / DAY_MS
  // Ein Kurs von vor Monaten darf zu Recht weit vom heutigen abweichen - dann sagt der Vergleich
  // nichts aus, weder für noch gegen die Reihe.
  if (ageDays > REFERENCE_MAX_AGE_DAYS) return 'unverified'
  const factor = last.price / referenceEur
  return factor <= REFERENCE_MAX_FACTOR && factor >= 1 / REFERENCE_MAX_FACTOR ? 'verified' : 'wrong'
}

/**
 * Aktueller Euro-Kurs einer Kryptowährung, als Vergleichsmaßstab für verifySeries. Zuerst aus dem
 * Kurs-Cache (kostet nichts), sonst frisch von CoinGecko - beim Anlegen einer neuen Position steht
 * dort noch nichts, und gerade dann werden die historischen Kurse zum ersten Mal geholt.
 */
async function currentEurPrice(identifier: string): Promise<number | null> {
  const cached = priceCacheRepo.listPriceCache().find((e) => e.identifier === identifier)
  if (cached && cached.currency === 'EUR' && cached.price > 0) return cached.price
  try {
    const [live] = await coingeckoService.getPricesEur([identifier])
    return live?.price ?? null
  } catch {
    return null
  }
}

/**
 * Rechnet Dollar-Kurse in Euro um - USDT ist an den Dollar gebunden und wird hier gleich
 * behandelt.
 *
 * Wichtig dabei: Krypto wird an sieben Tagen die Woche gehandelt, Wechselkurse gibt es nur an
 * Bankarbeitstagen. Für Samstage, Sonntage und Feiertage wird deshalb der zuletzt bekannte Kurs
 * fortgeschrieben - ohne das fielen rund zwei von sieben Tagen aus der Reihe heraus.
 */
async function dollarToEur(
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
  const referenceEur = await currentEurPrice(position.identifier!)

  // Beste bisher gefundene Reihe, falls keine Quelle bis zum Kaufdatum zurückreicht.
  let best: PricePoints = []
  // Nur falls gar keine geprüfte Reihe zustande kommt. Bewusst getrennt gehalten: die falsche
  // Yahoo-Reihe für Polygon reichte weiter zurück als die richtige von Binance - in einem
  // gemeinsamen Topf hätte sie gewonnen, und der Verlauf zeigte drei Jahre lang fremde Kurse.
  let unverified: PricePoints = []
  const startsEarlier = (points: PricePoints, than: PricePoints): boolean =>
    points.length > 0 && (than.length === 0 || points[0].date < than[0].date)

  /** Nimmt eine Quelle an; true bedeutet: die Reihe reicht bis zum Kaufdatum, Suche beendet. */
  const consider = (points: PricePoints): boolean => {
    const verdict = verifySeries(points, referenceEur)
    if (verdict === 'wrong') return false
    if (verdict === 'unverified') {
      if (startsEarlier(points, unverified)) unverified = points
      return false
    }
    if (startsEarlier(points, best)) best = points
    return covers(points, fromDate)
  }

  if (symbol) {
    try {
      const points = await yahooService.getHistoricalPrices(`${symbol}-EUR`, fromDate)
      // Nur brauchbar, wenn Yahoo das Paar kennt UND in EUR liefert.
      if (points.every((p) => p.currency === 'EUR') && consider(points)) return points
    } catch {
      // Paar bei Yahoo unbekannt.
    }

    // Dasselbe Paar in Dollar. Yahoo führt viele kleinere Coins NUR gegen Dollar, nicht gegen
    // Euro - Kamino und Pyth zum Beispiel. Ohne diesen Versuch blieben ihre ersten Monate
    // geschätzt, obwohl die Kurse verfügbar sind. Die Umrechnung übernimmt derselbe historische
    // Wechselkurs wie bei den Binance-Kursen.
    try {
      const usd = await yahooService.getHistoricalPrices(`${symbol}-USD`, fromDate)
      if (usd.every((point) => point.currency === 'USD')) {
        const eur = await dollarToEur(usd)
        if (consider(eur)) return eur
      }
    } catch {
      // Paar bei Yahoo unbekannt.
    }

    try {
      const usdt = await binanceService.getHistoricalPricesUsdt(symbol, fromDate)
      const eur = await dollarToEur(usdt)
      if (consider(eur)) return eur
    } catch {
      // Paar bei Binance unbekannt.
    }
  }

  try {
    const cg = await coingeckoService.getHistoricalPricesEur(position.identifier!, fromDate)
    if (consider(cg)) return cg
  } catch {
    // CoinGecko nicht erreichbar.
  }

  // Keine Quelle reicht bis zum Kaufdatum - dann die weiteste nehmen, der Rest bleibt geschätzt.
  // Eine ungeprüfte Reihe kommt nur zum Zug, wenn es gar keine geprüfte gibt.
  return best.length > 0 ? best : unverified
}

/**
 * Widerspricht die GESPEICHERTE Kursreihe dem aktuellen Kurs?
 *
 * Verglichen wird der jüngste gespeicherte Kurs vor heute mit dem Live-Kurs - beide in derselben
 * Währung, also direkt vergleichbar. Weicht er um mehr als das Vierfache ab, kann die Reihe nicht
 * zu diesem Wertpapier gehören: so viel bewegt sich kein Kurs an einem Tag.
 *
 * Das repariert Reihen, die vor dieser Prüfung aus einer falschen Quelle eingesammelt wurden. Ein
 * Fehlalarm ist ungefährlich - er kostet einen erneuten Abruf, der dieselben Kurse zurückbringt.
 */
function storedSeriesContradictsLive(identifier: string): boolean {
  const live = priceCacheRepo.listPriceCache().find((e) => e.identifier === identifier)
  if (!live || live.price <= 0 || live.fetchError !== null) return false
  const stored = historicalRepo.latestPriceBefore(identifier, new Date().toISOString().slice(0, 10))
  if (!stored || stored.price <= 0 || stored.currency !== live.currency) return false
  const factor = live.price / stored.price
  return factor > REFERENCE_MAX_FACTOR || factor < 1 / REFERENCE_MAX_FACTOR
}

/**
 * Holt Kursreihen neu, die nachweislich nicht zum Wertpapier gehören.
 *
 * Läuft bei jedem Kursabruf mit, tut aber im Normalfall nichts: geprüft wird nur eine einzige
 * Datenbankzeile je Position. Nötig, weil ensureHistoricalData eine vorhandene Reihe für erledigt
 * hält, solange sie lückenlos aussieht - eine falsche Reihe sieht genau so aus und bliebe sonst
 * für immer stehen.
 */
async function repairContradictedSeries(): Promise<void> {
  for (const position of positionsRepo.listPositions()) {
    if (position.assetClass === 'CASH_OTHER' || !position.identifier) continue
    if (!storedSeriesContradictsLive(position.identifier)) continue
    console.log(`Kursreihe von ${position.name} passt nicht zum aktuellen Kurs - wird neu geholt`)
    historicalRepo.deleteHistoricalPrices(position.identifier)
    await ensureHistoricalData(position)
  }
}

/**
 * Ab wann eine Kursreihe als aktuell genug gilt. Drei Tage Puffer, damit ein Wochenende oder
 * ein Feiertag ohne Handel nicht bei jedem Aufruf einen neuen Abruf auslöst.
 */
function staleBefore(): string {
  return new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
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
  const alreadyCoveredTo = historicalRepo.latestHistoricalDate(position.identifier)
  // Nicht nur prüfen, ob die Reihe weit genug ZURÜCK reicht, sondern auch, ob sie bis fast
  // heute läuft. Vorher wurde eine einmal geholte Reihe nie wieder verlängert - sie endete
  // beim Abrufdatum. Für den Verlaufs-Chart fiel das nicht auf (er nutzt die Reihe nur vor dem
  // ersten Snapshot), für die Gewinner/Verlierer-Liste dagegen sehr: "1 Tag" und "1 Woche"
  // fanden denselben letzten Kurs und zeigten deshalb dasselbe Ergebnis.
  if (
    alreadyCoveredFrom !== null &&
    alreadyCoveredFrom <= fromDate &&
    alreadyCoveredTo !== null &&
    alreadyCoveredTo >= staleBefore()
  ) {
    return
  }

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

    // STOCK_ETF, COMMODITY oder einzelne Anleihe
    const isin = bondIsin(position.identifier)
    let points: { date: string; price: number; currency: string }[]
    if (isin) {
      const history = await onvistaService.getBondHistory(isin, fromDate)
      points = (history?.points ?? []).map((pt) => ({ ...pt, currency: history!.currency }))
    } else {
      points = await yahooService.getHistoricalPrices(position.identifier, fromDate)
    }
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
 * Setzt die Kurse EINES Bereichs zurück: die gespeicherten Kursreihen seiner Positionen werden
 * verworfen und frisch geholt, danach laufen die Tageskurse neu.
 *
 * Bewusst OHNE den Snapshot-Verlauf anzufassen - der hält die Gesamtwerte aller Bereiche
 * gemeinsam fest. Ihn hier zu löschen träfe alle anderen Bereiche mit, und genau das soll ein
 * bereichsweises Zurücksetzen nicht tun. Dafür gibt es den Knopf auf der Positionen-Seite.
 */
export async function resetClass(
  cls: DisplayClass,
  onProgress: (event: ResetProgressEvent) => void
): Promise<RefreshResult> {
  const positions = positionsRepo.listPositions().filter((p) => displayClass(p) === cls)
  for (const position of positions) {
    onProgress({ positionId: position.id, name: position.name, status: 'processing' })
    if (position.identifier) historicalRepo.deleteHistoricalPrices(position.identifier)
    await ensureHistoricalData(position)
    onProgress({ positionId: position.id, name: position.name, status: 'done' })
  }
  return refreshAll()
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
