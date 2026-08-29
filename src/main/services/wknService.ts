import { resolveToTicker } from './openFigiService'

const WKN_PATTERN = /^[A-Z0-9]{6}$/i

/** WKNs sind immer genau 6 alphanumerische Zeichen - erst dann lohnt sich der Umweg über OpenFIGI. */
export function looksLikeWkn(query: string): boolean {
  return WKN_PATTERN.test(query.trim())
}

export async function resolveWknToTicker(wkn: string): Promise<{ name: string; ticker: string } | null> {
  return resolveToTicker('ID_WERTPAPIER', wkn)
}
