import type { SymbolSearchResult } from '../../shared/types'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

export interface CoinGeckoPrice {
  identifier: string
  price: number
}

/** Ein Batch-Call für alle Krypto-Identifier gleichzeitig. Preise kommen direkt in EUR - keine FX-Umrechnung nötig. */
export async function getPricesEur(coinIds: string[]): Promise<CoinGeckoPrice[]> {
  if (coinIds.length === 0) return []
  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinIds.join(','))}&vs_currencies=eur`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko-Preisabruf fehlgeschlagen: HTTP ${res.status}`)
  const data = (await res.json()) as Record<string, { eur?: number }>
  const out: CoinGeckoPrice[] = []
  for (const id of coinIds) {
    const eur = data[id]?.eur
    if (typeof eur === 'number') out.push({ identifier: id, price: eur })
  }
  return out
}

const DAY_MS = 24 * 60 * 60 * 1000
const FREE_TIER_MAX_DAYS = 365

export interface HistoricalPricePoint {
  date: string
  price: number
}

/**
 * Tageskurse in EUR von fromDate bis heute. Der kostenlose CoinGecko-Tarif erlaubt
 * `market_chart` nur für die letzten 365 Tage (HTTP 401 darüber hinaus) - wird deshalb
 * automatisch gekappt; für ältere Zeiträume greift die Einstandspreis-Schätzung im Chart.
 */
export async function getHistoricalPricesEur(coinId: string, fromDate: string): Promise<HistoricalPricePoint[]> {
  const fromMs = new Date(fromDate).getTime()
  const requestedDays = Math.ceil((Date.now() - fromMs) / DAY_MS) + 1
  const days = Math.max(1, Math.min(FREE_TIER_MAX_DAYS, requestedDays))
  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=eur&days=${days}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko-Historie fehlgeschlagen: HTTP ${res.status}`)
  const data = (await res.json()) as { prices?: [number, number][] }

  // CoinGecko liefert je nach Zeitraum feinere Granularität als täglich - auf einen Kurs pro
  // Kalendertag eindampfen (letzter Kurs des Tages gewinnt, da spätere Einträge überschreiben).
  const byDate = new Map<string, number>()
  for (const [ts, price] of data.prices ?? []) {
    byDate.set(new Date(ts).toISOString().slice(0, 10), price)
  }
  return [...byDate.entries()].map(([date, price]) => ({ date, price })).sort((a, b) => a.date.localeCompare(b.date))
}

export async function searchCoins(query: string): Promise<SymbolSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(trimmed)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CoinGecko-Suche fehlgeschlagen: HTTP ${res.status}`)
  const data = (await res.json()) as { coins?: { id: string; symbol: string; name: string }[] }
  return (data.coins ?? []).slice(0, 8).map((c) => ({
    identifier: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    exchange: null,
    securityType: null,
    currency: 'EUR',
    sector: null,
    region: null
  }))
}
