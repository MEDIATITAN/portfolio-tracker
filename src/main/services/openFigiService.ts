interface OpenFigiEntry {
  name: string
  ticker: string
}

/**
 * Löst eine WKN oder ISIN in Firmenname + Ticker auf, über OpenFIGI (Bloomberg, kostenlos, kein
 * API-Key nötig). Weder Yahoo Finance noch die meisten anderen kostenlosen Finanz-APIs kennen WKN
 * oder ISIN direkt (live getestet), deshalb dieser Umweg: WKN/ISIN -> OpenFIGI -> Ticker/Name ->
 * normale Yahoo-Suche (siehe positionsHandlers.ts und csvImportService.ts).
 */
export async function resolveToTicker(idType: 'ID_WERTPAPIER' | 'ID_ISIN', idValue: string): Promise<OpenFigiEntry | null> {
  const res = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ idType, idValue }])
  })
  if (!res.ok) return null

  const body = (await res.json()) as { data?: OpenFigiEntry[] }[]
  const first = body[0]?.data?.[0]
  return first ? { name: first.name, ticker: first.ticker } : null
}
