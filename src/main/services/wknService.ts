const WKN_PATTERN = /^[A-Z0-9]{6}$/i

/** WKNs sind immer genau 6 alphanumerische Zeichen - erst dann lohnt sich der Umweg über OpenFIGI. */
export function looksLikeWkn(query: string): boolean {
  return WKN_PATTERN.test(query.trim())
}

interface OpenFigiEntry {
  name: string
  ticker: string
}

/**
 * Löst eine deutsche WKN in Firmenname + Ticker auf, über OpenFIGI (Bloomberg, kostenlos, kein
 * API-Key nötig - großzügiges Rate-Limit für Gelegenheitsnutzung). Yahoo Finance selbst kennt
 * WKNs nicht (live getestet: 0 Treffer für bekannte WKNs), deshalb dieser Umweg: WKN -> OpenFIGI
 * -> Ticker/Name -> normale Yahoo-Suche (siehe positionsHandlers.ts).
 */
export async function resolveWknToTicker(wkn: string): Promise<OpenFigiEntry | null> {
  const res = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ idType: 'ID_WERTPAPIER', idValue: wkn }])
  })
  if (!res.ok) return null

  const body = (await res.json()) as { data?: OpenFigiEntry[] }[]
  const first = body[0]?.data?.[0]
  return first ? { name: first.name, ticker: first.ticker } : null
}
