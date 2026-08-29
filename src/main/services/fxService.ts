const FRANKFURTER_BASE = 'https://api.frankfurter.dev/v2'

export interface FxRateResult {
  base: string
  quote: string
  rate: number
}

interface FrankfurterEntry {
  date: string
  base: string
  quote: string
  rate: number
}

/** Ein Batch-Call für alle vorkommenden Fremdwährungen gegen die Basiswährung gleichzeitig. */
export async function getRates(base: string, quotes: string[]): Promise<FxRateResult[]> {
  if (quotes.length === 0) return []
  const url = `${FRANKFURTER_BASE}/rates?base=${encodeURIComponent(base)}&quotes=${encodeURIComponent(quotes.join(','))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Frankfurter-Wechselkursabruf fehlgeschlagen: HTTP ${res.status}`)
  const data = (await res.json()) as FrankfurterEntry[]
  return data.map((d) => ({ base: d.base, quote: d.quote, rate: d.rate }))
}

export interface HistoricalRatePoint {
  date: string
  rate: number
}

/** Tageskurse eines Währungspaares von fromDate bis heute (ein Call für den ganzen Zeitraum). */
export async function getHistoricalRates(base: string, quote: string, fromDate: string): Promise<HistoricalRatePoint[]> {
  const toDate = new Date().toISOString().slice(0, 10)
  const url = `${FRANKFURTER_BASE}/rates?base=${encodeURIComponent(base)}&from=${fromDate}&to=${toDate}&quotes=${encodeURIComponent(quote)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Frankfurter-Historie fehlgeschlagen: HTTP ${res.status}`)
  const data = (await res.json()) as FrankfurterEntry[]
  return data.map((d) => ({ date: d.date, rate: d.rate }))
}
