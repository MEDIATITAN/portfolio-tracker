import YahooFinanceImport from 'yahoo-finance2'
import type { AssetClass, SecurityType, SymbolSearchResult } from '../../shared/types'

// yahoo-finance2's default export is a class: instance methods (quote/search/...) only work on
// `new YahooFinance()`. With the package externalized for main (see electron.vite.config.ts),
// the CJS require() returns the raw `{ default: YahooFinance }` exports object instead of the
// class itself in this esbuild/electron-vite setup - unwrap it defensively either way.
type YahooFinanceCtor = typeof YahooFinanceImport
const YahooFinanceClass: YahooFinanceCtor =
  typeof YahooFinanceImport === 'function'
    ? YahooFinanceImport
    : (YahooFinanceImport as unknown as { default: YahooFinanceCtor }).default

const yahooFinance = new YahooFinanceClass({ suppressNotices: ['yahooSurvey'] })

export interface YahooQuote {
  identifier: string
  price: number
  currency: string
}

/** Ein Batch-Call für alle Aktien/ETF/Rohstoff-Identifier gleichzeitig, statt einer Schleife. */
export async function getQuotes(identifiers: string[]): Promise<YahooQuote[]> {
  if (identifiers.length === 0) return []
  const quotes = await yahooFinance.quote(identifiers)
  const out: YahooQuote[] = []
  for (const q of quotes) {
    if (typeof q.regularMarketPrice === 'number' && q.currency) {
      out.push({ identifier: q.symbol, price: q.regularMarketPrice, currency: q.currency })
    }
  }
  return out
}

const RELEVANT_QUOTE_TYPES: Record<AssetClass, string[]> = {
  STOCK_ETF: ['EQUITY', 'ETF'],
  COMMODITY: ['FUTURE'],
  CRYPTO: [],
  CASH_OTHER: []
}

function toSecurityType(quoteType: string): SecurityType | null {
  if (quoteType === 'ETF') return 'ETF'
  if (quoteType === 'EQUITY') return 'STOCK'
  return null
}

export async function searchSymbols(query: string, assetClass: AssetClass): Promise<SymbolSearchResult[]> {
  const trimmed = query.trim()
  const wantedTypes = RELEVANT_QUOTE_TYPES[assetClass]
  if (!trimmed || wantedTypes.length === 0) return []

  const result = await yahooFinance.search(trimmed, { quotesCount: 8, newsCount: 0 })
  const out: SymbolSearchResult[] = []
  for (const q of result.quotes) {
    if (q.isYahooFinance !== true) continue
    if (!wantedTypes.includes(q.quoteType)) continue
    out.push({
      identifier: q.symbol,
      symbol: q.symbol,
      name: q.longname ?? q.shortname ?? q.symbol,
      exchange: q.exchange ?? null,
      securityType: toSecurityType(q.quoteType),
      currency: null,
      sector: q.sector ?? null,
      region: null
    })
  }
  return out
}

export interface HistoricalPricePoint {
  date: string
  price: number
  currency: string
}

/** Tageskurse von fromDate bis heute. Wird nur beim Anlegen/Bearbeiten einer Position aufgerufen,
 *  nicht bei jedem Refresh - das ist ein größerer Abruf als ein normaler Kursabruf. */
export async function getHistoricalPrices(identifier: string, fromDate: string): Promise<HistoricalPricePoint[]> {
  const result = await yahooFinance.chart(identifier, { period1: fromDate, interval: '1d' })
  const currency = result.meta.currency
  const out: HistoricalPricePoint[] = []
  for (const q of result.quotes) {
    // Der letzte Punkt (heute, während die Börse noch offen ist) hat oft noch keinen close-Kurs.
    if (typeof q.close !== 'number') continue
    out.push({ date: q.date.toISOString().slice(0, 10), price: q.close, currency })
  }
  return out
}

export interface TopHoldings {
  /** Sektorgewichte des Fonds, 0..1, summieren auf ~1 (vollständige Angabe von Yahoo). */
  sectorWeightings: { sector: string; weight: number }[]
  /** Nur die größten Einzelpositionen (Yahoo liefert i.d.R. 10) - deckt NICHT den ganzen Fonds ab. */
  holdings: { symbol: string; weight: number }[]
}

/** Fondszusammensetzung; null wenn das Papier kein Fonds ist (z.B. Einzelaktie oder physischer ETC). */
export async function getTopHoldings(identifier: string): Promise<TopHoldings | null> {
  try {
    const summary = await yahooFinance.quoteSummary(identifier, { modules: ['topHoldings'] })
    const th = summary.topHoldings
    if (!th) return null

    // sectorWeightings kommt als Array einzelner Objekte mit je EINEM Schlüssel: [{technology: 0.37}, ...]
    const sectorWeightings: { sector: string; weight: number }[] = []
    for (const entry of th.sectorWeightings ?? []) {
      for (const [sector, weight] of Object.entries(entry as Record<string, number>)) {
        if (typeof weight === 'number') sectorWeightings.push({ sector, weight })
      }
    }

    const holdings: { symbol: string; weight: number }[] = []
    for (const h of th.holdings ?? []) {
      if (h.symbol && typeof h.holdingPercent === 'number') holdings.push({ symbol: h.symbol, weight: h.holdingPercent })
    }

    if (sectorWeightings.length === 0 && holdings.length === 0) return null
    return { sectorWeightings, holdings }
  } catch {
    return null
  }
}

/** Zusätzlicher Call NUR beim Auswählen eines Suchergebnisses (nicht bei jedem Tastendruck) - liefert Sektor/Land. */
export async function getAssetProfile(
  identifier: string
): Promise<{ sector: string | null; region: string | null }> {
  try {
    const summary = await yahooFinance.quoteSummary(identifier, { modules: ['assetProfile'] })
    return {
      sector: summary.assetProfile?.sector ?? null,
      region: summary.assetProfile?.country ?? null
    }
  } catch {
    return { sector: null, region: null }
  }
}
