import { resolveToTicker, yahooSymbolFor, type OpenFigiEntry } from './openFigiService'
import * as yahooService from './yahooService'
import * as onvistaService from './onvistaService'
import type { AssetClass, SymbolSearchResult } from '../../shared/types'

const WKN_PATTERN = /^[A-Z0-9]{6}$/i

/** WKNs sind immer genau 6 alphanumerische Zeichen - erst dann lohnt sich der Umweg über OpenFIGI. */
export function looksLikeWkn(query: string): boolean {
  return WKN_PATTERN.test(query.trim())
}

export async function resolveWknToTicker(wkn: string): Promise<OpenFigiEntry | null> {
  return resolveToTicker('ID_WERTPAPIER', wkn)
}

/**
 * Sucht einen per OpenFIGI aufgelösten Wert bei Yahoo. Zuerst das eindeutige Kürzel aus Ticker und
 * Börsenplatz, dann der Ticker - aber nur Treffer, die wirklich so heißen: Yahoo sucht unscharf,
 * "CDR" (CD Projekt, WKN 534356) liefert sonst kanadische Depositary Receipts wie NVDA.TO. Zuletzt
 * der Firmenname.
 */
export async function searchResolved(
  match: OpenFigiEntry,
  assetClass: AssetClass
): Promise<SymbolSearchResult[]> {
  const exact = yahooSymbolFor(match)
  if (exact) {
    const hits = (await yahooService.searchSymbols(exact, assetClass)).filter(
      (r) => r.symbol.toUpperCase() === exact.toUpperCase()
    )
    if (hits.length > 0) return hits
  }
  const ticker = match.ticker.toUpperCase()
  const byTicker = (await yahooService.searchSymbols(match.ticker, assetClass)).filter(
    (r) => r.symbol === ticker || r.symbol.startsWith(ticker + '.')
  )
  if (byTicker.length > 0) return byTicker
  return yahooService.searchSymbols(match.name, assetClass)
}

/**
 * Sucht einen Wert über seine WKN. Zuerst über die ISIN (WKN -> ISIN bei onvista -> Yahoo): das
 * ist eindeutig und findet auch Zertifikate und ETPs, die OpenFIGI nur unter Kürzeln kennt, mit
 * denen Yahoo nichts anfangen kann. Erst wenn das nichts liefert, der Weg über OpenFIGI.
 */
export async function searchByWkn(
  wkn: string,
  assetClass: AssetClass
): Promise<SymbolSearchResult[]> {
  const isin = await onvistaService.isinForWkn(wkn).catch(() => null)
  if (isin) {
    const hits = await yahooService.searchSymbols(isin, assetClass)
    if (hits.length > 0) return hits
  }
  const resolved = await resolveWknToTicker(wkn)
  return resolved ? searchResolved(resolved, assetClass) : []
}
