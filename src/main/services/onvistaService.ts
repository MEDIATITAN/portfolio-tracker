import { canonicalCountry, isCashLabel } from '../../shared/countries'

/**
 * Länderaufteilung von ETFs über onvista.
 *
 * Warum eine zweite Quelle neben Yahoo: Yahoo gibt für Fonds KEINE Länderaufteilung heraus, nur die
 * größten Einzelpositionen - beim Vanguard S&P 500 sind das 37,7% des Fondsvermögens, der Rest
 * bliebe unbekannt. onvista veröffentlicht die vom Fondsanbieter gemeldete, vollständige Aufteilung
 * (bei denselben Fonds 96,7-100%). Nachgemessen an allen ETFs dieses Depots.
 *
 * Die Schnittstelle ist undokumentiert und kann sich ändern - deshalb gibt jede Funktion im
 * Fehlerfall null zurück und der Aufrufer fällt auf die bisherige Yahoo-Logik zurück.
 */

const BASE = 'https://api.onvista.de/api/v1'
// Ohne gesetzten User-Agent antwortet die Schnittstelle nicht zuverlässig.
const HEADERS = { 'User-Agent': 'Mozilla/5.0' }
const TIMEOUT_MS = 10_000

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

interface BreakdownEntry {
  nameBreakdown?: unknown
  investmentPct?: unknown
}

interface SearchHit {
  entitySubType?: unknown
  isin?: unknown
  name?: unknown
}

export interface CountryWeight {
  /** Land in der englischen Yahoo-Schreibweise, damit es mit Einzelaktien zusammenfällt. */
  country: string
  /** Anteil am Fondsvermögen als Bruchteil (0..1). */
  weight: number
}

export interface CountryBreakdown {
  weights: CountryWeight[]
  /** Summe der Gewichte - wie viel des Fonds tatsächlich einem Land zugeordnet ist. */
  covered: number
}

/**
 * Vollständige Länderaufteilung eines Fonds. Barmittel werden entfernt (kein Land), die Namen in
 * die englische Schreibweise übersetzt und gleiche Länder zusammengefasst - onvista kann denselben
 * Namen mehrfach liefern, und die Übersetzung kann zwei Bezeichnungen auf dasselbe Land abbilden.
 */
export async function getCountryBreakdown(isin: string): Promise<CountryBreakdown | null> {
  const data = (await getJson(`${BASE}/funds/ISIN:${encodeURIComponent(isin)}/breakdowns`)) as {
    countryBreakdown?: { list?: BreakdownEntry[] }
  } | null
  const list = data?.countryBreakdown?.list
  if (!Array.isArray(list) || list.length === 0) return null

  const byCountry = new Map<string, number>()
  for (const entry of list) {
    const label = typeof entry.nameBreakdown === 'string' ? entry.nameBreakdown : null
    const pct = typeof entry.investmentPct === 'number' ? entry.investmentPct : null
    if (!label || pct === null || pct <= 0 || isCashLabel(label)) continue
    const country = canonicalCountry(label)
    byCountry.set(country, (byCountry.get(country) ?? 0) + pct / 100)
  }

  if (byCountry.size === 0) return null
  const weights = [...byCountry.entries()]
    .map(([country, weight]) => ({ country, weight }))
    .sort((a, b) => b.weight - a.weight)
  return { weights, covered: weights.reduce((sum, w) => sum + w.weight, 0) }
}

/**
 * Wörter, die die Ertragsverwendung angeben. Bewusst eine feste Liste statt einer Präfixregel:
 * "dis" als Präfix würde "Consumer Discretionary" fälschlich als ausschüttende Tranche lesen.
 */
const ACC_TOKENS = new Set(['acc', 'accum', 'accumulating', 'accumulation', 'thesaurierend'])
const DIS_TOKENS = new Set([
  'dis',
  'dist',
  'distributing',
  'distribution',
  'ausschüttend',
  'ausschuettend'
])

type Tranche = 'acc' | 'dis' | null

function tokenize(name: string): string[] {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      // Alle Schreibweisen derselben Ertragsverwendung auf ein Wort ziehen, sonst zählt
      // "Accumulation" gegen "Acc." als Unterschied.
      .map((t) => (ACC_TOKENS.has(t) ? 'acc' : DIS_TOKENS.has(t) ? 'dis' : t))
  )
}

function trancheOf(tokens: string[]): Tranche {
  if (tokens.includes('acc')) return 'acc'
  if (tokens.includes('dis')) return 'dis'
  return null
}

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

async function searchEtfs(query: string): Promise<{ isin: string; name: string }[]> {
  const data = (await getJson(
    `${BASE}/instruments/search?searchValue=${encodeURIComponent(query)}&limit=10`
  )) as { list?: SearchHit[] } | null
  return (data?.list ?? [])
    .filter(
      (h): h is { entitySubType: string; isin: string; name: string } =>
        h.entitySubType === 'ETF' && typeof h.isin === 'string' && typeof h.name === 'string'
    )
    .map((h) => ({ isin: h.isin, name: h.name }))
}

/**
 * Sucht die ISIN zu einem Fondsnamen.
 *
 * Zwei nachgemessene Eigenheiten der Suche bestimmen den Aufbau:
 *
 * 1. Sie verhält sich wie eine Phrasensuche - je mehr Wörter, desto weniger Treffer. "Vanguard S&P
 *    500 UCITS ETF USD Accumulating" liefert NULL Treffer, "... USD" dagegen beide Tranchen. Also
 *    wird die Anfrage schrittweise von hinten gekürzt, bis Treffer kommen.
 * 2. Denselben Fonds gibt es ausschüttend UND thesaurierend, mit fast identischem Namen und
 *    unterschiedlicher ISIN. Die Ertragsverwendung ist deshalb ein AUSSCHLUSSKRITERIUM, kein
 *    Punktabzug: Kandidaten der gegenteiligen Tranche fliegen raus, bevor überhaupt bewertet wird.
 *    Nur mitzubewerten reichte nachweislich nicht - bei "Vanguard S&P 500 UCITS ETF USD
 *    Accumulation" gewann sonst die Dis.-Tranche, weil beide Namen gleich viele Wörter teilen.
 *
 * Bewertet wird gegen den VOLLSTÄNDIGEN Namen, nicht gegen die gekürzte Anfrage. Liegt die beste
 * Überdeckung unter der Hälfte, wird lieber nichts zurückgegeben als etwas Falsches gespeichert.
 */
export async function findIsinByName(name: string): Promise<{ isin: string; name: string } | null> {
  const trimmed = name.trim()
  if (ISIN_PATTERN.test(trimmed.toUpperCase())) {
    const direct = await searchEtfs(trimmed)
    return direct[0] ?? null
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  let hits: { isin: string; name: string }[] = []
  for (let len = words.length; len >= 2 && hits.length === 0; len--) {
    hits = await searchEtfs(words.slice(0, len).join(' '))
  }
  if (hits.length === 0) return null

  const wantedTokens = tokenize(trimmed)
  const wantedTranche = trancheOf(wantedTokens)
  const candidates =
    wantedTranche === null
      ? hits
      : // Kandidaten ohne erkennbare Tranche bleiben drin - manche Fonds gibt es nur in einer.
        hits.filter((h) => {
          const t = trancheOf(tokenize(h.name))
          return t === null || t === wantedTranche
        })
  if (candidates.length === 0) return null

  const wanted = new Set(wantedTokens)
  let best: { isin: string; name: string; score: number } | null = null
  for (const hit of candidates) {
    const hitTokens = tokenize(hit.name)
    const shared = hitTokens.filter((t) => wanted.has(t)).length
    // An der Vereinigung messen, damit ein Treffer mit vielen ZUSÄTZLICHEN Wörtern nicht genauso
    // gut abschneidet wie der exakte.
    const score = shared / new Set([...wanted, ...hitTokens]).size
    if (!best || score > best.score) best = { isin: hit.isin, name: hit.name, score }
  }
  if (!best || best.score < 0.5) return null
  return { isin: best.isin, name: best.name }
}
