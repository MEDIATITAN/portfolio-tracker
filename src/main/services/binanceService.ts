/**
 * Historische Krypto-Tageskurse von der öffentlichen Binance-Schnittstelle.
 *
 * Dritte Quelle nach Yahoo und CoinGecko, gebraucht für kleinere Coins:
 * - CoinGecko gibt im kostenlosen Tarif nur 365 Tage heraus (auch der Einzeltag-Endpunkt
 *   /coins/{id}/history antwortet darüber hinaus mit HTTP 401 - nachgemessen).
 * - Yahoo führt nur die großen Coins als "<SYMBOL>-EUR"; für BONK, PYTH, KMNO, TRUMP oder POL
 *   existiert dort kein Paar.
 *
 * Binance liefert ohne Schlüssel bis zu 1000 Tageskerzen je Anfrage und reicht bis zum
 * Listing-Datum des jeweiligen Paares zurück. Notiert wird in USDT - die Umrechnung nach Euro
 * übernimmt der Aufrufer mit den historischen Wechselkursen.
 */

const BASE = 'https://api.binance.com/api/v3'
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_PER_REQUEST = 1000
const TIMEOUT_MS = 15_000

/**
 * Umbenannte Token: Der Kurs vor der Umstellung steht nur unter dem alten Kürzel.
 * Polygon hat MATIC im Verhältnis 1:1 durch POL ersetzt - POLUSDT beginnt erst im September 2024,
 * MATICUSDT reicht bis April 2019 zurück und beschreibt denselben Wert.
 */
const RENAMED: Record<string, string> = { POL: 'MATIC' }

export interface DailyPrice {
  date: string
  price: number
}

async function fetchKlines(
  pair: string,
  startMs: number,
  interval: string
): Promise<number[][] | null> {
  try {
    const url = `${BASE}/klines?symbol=${pair}&interval=${interval}&startTime=${startMs}&limit=${MAX_PER_REQUEST}`
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? (data as number[][]) : null
  } catch {
    return null
  }
}

/**
 * Tages-Schlusskurse in USDT ab fromDate. Blättert weiter, bis das heutige Datum erreicht ist -
 * eine Anfrage deckt knapp drei Jahre ab, mehrere Seiten sind also nur bei langer Historie nötig.
 */
/**
 * Stundenkurse in USDT ab `fromMs`. Anders als bei Aktien gibt es sie rund um die Uhr - Krypto
 * wird auch nachts und am Wochenende gehandelt.
 */
export async function getHourlyPricesUsdt(
  symbol: string,
  fromMs: number
): Promise<{ ts: string; price: number }[]> {
  const upper = symbol.trim().toUpperCase()
  if (!upper) return []
  const klines = await fetchKlines(`${upper}USDT`, fromMs, '1h')
  if (!klines) return []
  const out: { ts: string; price: number }[] = []
  for (const k of klines) {
    const close = Number(k[4])
    if (!Number.isFinite(close) || close <= 0) continue
    out.push({ ts: new Date(k[0]).toISOString(), price: close })
  }
  return out
}

export async function getHistoricalPricesUsdt(
  symbol: string,
  fromDate: string
): Promise<DailyPrice[]> {
  const upper = symbol.trim().toUpperCase()
  if (!upper) return []

  const byDate = new Map<string, number>()
  // Erst das aktuelle Kürzel, dann das alte - so gewinnt bei Überschneidung der aktuelle Kurs.
  const symbols = [upper, RENAMED[upper]].filter(Boolean) as string[]

  for (const sym of symbols) {
    let cursor = Date.parse(fromDate)
    if (Number.isNaN(cursor)) return []
    for (;;) {
      const klines = await fetchKlines(`${sym}USDT`, cursor, '1d')
      if (!klines || klines.length === 0) break
      for (const k of klines) {
        const date = new Date(k[0]).toISOString().slice(0, 10)
        const close = Number(k[4])
        // Nicht überschreiben: das zuerst abgefragte (aktuelle) Kürzel hat Vorrang.
        if (!byDate.has(date) && Number.isFinite(close) && close > 0) byDate.set(date, close)
      }
      if (klines.length < MAX_PER_REQUEST) break
      cursor = Number(klines[klines.length - 1][0]) + DAY_MS
    }
  }

  return [...byDate.entries()]
    .map(([date, price]) => ({ date, price }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
