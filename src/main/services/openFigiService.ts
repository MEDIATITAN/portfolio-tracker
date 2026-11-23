export interface OpenFigiEntry {
  name: string
  ticker: string
  /** Bloomberg-Börsenkürzel, etwa 'PW' für Warschau oder 'GY' für Xetra. */
  exchCode: string | null
}

/**
 * Bloomberg-Börsenkürzel -> Endung des Yahoo-Symbols. Mit ihr wird aus dem nackten Ticker das
 * eindeutige Yahoo-Kürzel ('CDR' + Warschau = 'CDR.WA'); der Ticker allein ist oft mehrdeutig.
 */
const YAHOO_SUFFIX: Record<string, string> = {
  US: '',
  UN: '',
  UW: '',
  GY: '.DE',
  GR: '.F',
  LN: '.L',
  FP: '.PA',
  NA: '.AS',
  BB: '.BR',
  SM: '.MC',
  IM: '.MI',
  SW: '.SW',
  SE: '.SW',
  AV: '.VI',
  PW: '.WA',
  DC: '.CO',
  SS: '.ST',
  NO: '.OL',
  FH: '.HE',
  PL: '.LS',
  ID: '.IR',
  JT: '.T',
  HK: '.HK',
  CN: '.TO',
  AT: '.AX'
}

/** Das Yahoo-Symbol zum OpenFIGI-Treffer, oder null, wenn der Börsenplatz unbekannt ist. */
export function yahooSymbolFor(entry: OpenFigiEntry): string | null {
  const suffix = entry.exchCode ? YAHOO_SUFFIX[entry.exchCode] : undefined
  return suffix === undefined ? null : entry.ticker + suffix
}

/**
 * Löst eine WKN oder ISIN in Firmenname + Ticker auf, über OpenFIGI (Bloomberg, kostenlos, kein
 * API-Key nötig). Weder Yahoo Finance noch die meisten anderen kostenlosen Finanz-APIs kennen WKN
 * oder ISIN direkt (live getestet), deshalb dieser Umweg: WKN/ISIN -> OpenFIGI -> Ticker/Name ->
 * normale Yahoo-Suche (siehe positionsHandlers.ts und csvImportService.ts).
 */
export async function resolveToTicker(
  idType: 'ID_WERTPAPIER' | 'ID_ISIN',
  idValue: string
): Promise<OpenFigiEntry | null> {
  const res = await fetch('https://api.openfigi.com/v3/mapping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ idType, idValue }])
  })
  if (!res.ok) return null

  const body = (await res.json()) as { data?: OpenFigiEntry[] }[]
  const first = body[0]?.data?.[0]
  return first ? { name: first.name, ticker: first.ticker, exchCode: first.exchCode ?? null } : null
}
