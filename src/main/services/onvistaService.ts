import { canonicalCountry, countryFromIsoCode, isCashLabel } from '../../shared/countries'

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

/**
 * Anleihen bei onvista.
 *
 * Warum hier und nicht bei Yahoo: Yahoo führt einzelne Anleihen überhaupt nicht - weder über ISIN
 * noch über WKN noch über die Börsenkürzel der deutschen Plätze kommt eine Notierung zurück
 * (nachgemessen an einer Bundesanleihe). onvista listet sie dagegen inklusive US-Staatsanleihen,
 * findet sie über die WKN und gibt Kurs wie Historie heraus.
 *
 * WICHTIG - Anleihen notieren in PROZENT ihres Nennwerts, nicht in Euro je Stück. Ein Kurs von
 * 92,37 bedeutet: 1.000 Euro Nennwert sind aktuell 923,70 Euro wert. Die Umrechnung passiert hier
 * an der Quelle (Kurs geteilt durch 100), damit der Rest der Anwendung mit Anleihen genauso rechnen
 * kann wie mit jedem anderen Wertpapier: Menge mal Kurs. Die "Menge" einer Anleihe ist ihr
 * Nennwert.
 */

export interface BondHit {
  isin: string
  wkn: string
  name: string
}

interface BondSearchHit {
  entityType?: unknown
  isin?: unknown
  wkn?: unknown
  name?: unknown
}

/**
 * Eine WKN besteht aus Ziffern und Großbuchstaben, enthält aber NIE ein O oder ein I - genau
 * deshalb, damit sie nicht mit der Null und der Eins verwechselt werden. Beim Abtippen passiert
 * das trotzdem: aus "A3K0N8" wird "A3KON8" und die Suche findet nichts. Steht ein O oder I in
 * einer WKN-artigen Eingabe, kann es also nur ein Lesefehler sein - dann wird ersetzt und erneut
 * gesucht.
 */
function normalizeWkn(query: string): string | null {
  const trimmed = query.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(trimmed) || !/[OI]/.test(trimmed)) return null
  return trimmed.replace(/O/g, '0').replace(/I/g, '1')
}

async function searchBondsRaw(query: string): Promise<BondHit[]> {
  const data = (await getJson(
    `${BASE}/instruments/search?searchValue=${encodeURIComponent(query.trim())}&limit=15`
  )) as { list?: BondSearchHit[] } | null
  return (data?.list ?? [])
    .filter(
      (h): h is { entityType: string; isin: string; wkn: string; name: string } =>
        h.entityType === 'BOND' &&
        typeof h.isin === 'string' &&
        typeof h.wkn === 'string' &&
        typeof h.name === 'string'
    )
    .map((h) => ({ isin: h.isin, wkn: h.wkn, name: h.name }))
}

/**
 * Die ISIN zu einer WKN, gleich welcher Wertpapierart. Yahoo kennt keine WKNs, findet aber viele
 * Werte über die ISIN - etwa Krypto-ETPs wie 21Shares Solana (A3GSS0 -> CH1114873776 -> ASOL.SW),
 * die über Ticker oder Namen nicht auffindbar sind.
 */
export async function isinForWkn(wkn: string): Promise<string | null> {
  const wanted = wkn.trim().toUpperCase()
  const data = (await getJson(
    `${BASE}/instruments/search?searchValue=${encodeURIComponent(wanted)}&limit=5`
  )) as { list?: BondSearchHit[] } | null
  const hit = (data?.list ?? []).find((h) => h.wkn === wanted && typeof h.isin === 'string')
  return hit ? (hit.isin as string) : null
}

/** Sucht Anleihen über WKN, ISIN oder Namen. WKN und ISIN findet die Suche direkt und exakt. */
export async function searchBonds(query: string): Promise<BondHit[]> {
  const hits = await searchBondsRaw(query)
  if (hits.length > 0) return hits
  const corrected = normalizeWkn(query)
  return corrected ? searchBondsRaw(corrected) : []
}

interface BondSnapshot {
  instrument?: { entityValue?: unknown; name?: unknown; wkn?: unknown }
  bondsIssuer?: { isoCountry?: unknown; nameCountry?: unknown }
  bondsDetails?: { isoCurrency?: unknown }
  quote?: {
    last?: unknown
    isoCurrency?: unknown
    unitType?: unknown
    market?: { idNotation?: unknown }
  }
}

export interface BondQuote {
  /** Kurs je EINER Einheit Nennwert, also der Prozentkurs geteilt durch 100. */
  price: number
  currency: string
  name: string
  /** Interne onvista-Kennungen, für den Abruf der Historie. */
  entityValue: string
  idNotation: number
  /** Sitzland des Emittenten in der englischen Schreibweise, oder null. */
  country: string | null
}

/**
 * Die Währung, auf die der Nennwert lautet - und damit die einzige, in der ein Anleihenwert
 * überhaupt Sinn ergibt.
 *
 * Warum NICHT die Währung der Notierung: onvista wählt als Standardkurs je nach Handelslage
 * einen anderen Platz, und die Plätze etikettieren unterschiedlich. Für dieselbe
 * US-Staatsanleihe liefern Frankfurt, München, Stuttgart und die Commerzbank "USD", Baader
 * Trading und Stuttgart TradeREBEL dagegen "EUR" - bei praktisch identischem Prozentkurs
 * (99,18 gegenüber 99,20). Nachgemessen an der Notierungsliste einer einzigen Abfrage.
 *
 * Das ist auch sachlich richtig: ein Anleihenkurs ist ein PROZENTSATZ des Nennwerts und damit
 * währungslos. 99,2 % von 1.100 Dollar Nennwert sind 1.091 Dollar - unabhängig davon, an
 * welchem Platz und in welcher Etikettierung der Prozentsatz gestellt wurde. Wer stattdessen
 * die Platzwährung nimmt, bewertet dieselbe Anleihe je nach Tageslaune einmal in Dollar und
 * einmal in Euro; hier war das ein Sprung von rund 15 % im Vermögensverlauf.
 */
function denominationCurrency(snap: BondSnapshot | null): string | null {
  const denominated = snap?.bondsDetails?.isoCurrency
  if (typeof denominated === 'string' && denominated.length === 3) return denominated
  const quoted = snap?.quote?.isoCurrency
  return typeof quoted === 'string' ? quoted : null
}

async function getSnapshot(isin: string): Promise<BondSnapshot | null> {
  return (await getJson(
    `${BASE}/bonds/ISIN:${encodeURIComponent(isin.trim().toUpperCase())}/snapshot`
  )) as BondSnapshot | null
}

/**
 * Obergrenze für einen Prozentkurs. onvista setzt an Tagen ohne Umsatz den Platzhalter
 * 999999.05 statt eines Kurses - in der Verlaufsreihe der US-Anleihe stand dadurch ein Tag mit
 * 9,5 Millionen Euro, der das ganze Diagramm plattdrückte. Auch das Feld highPrice1Year der
 * Momentaufnahme trägt denselben Wert, es ist also der hausübliche Platzhalter.
 *
 * 1000 % liegt weit über allem, was real vorkommt (lang laufende Hochkuponanleihen erreichen
 * gut 150 %), und weit unter dem Platzhalter - dazwischen ist reichlich Luft.
 */
const MAX_PLAUSIBLE_PERCENT = 1000

/** Umrechnung Prozentkurs -> Kurs je Einheit Nennwert; alles andere gilt als unbrauchbar. */
function fromPercent(value: unknown, unitType: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  if (value > MAX_PLAUSIBLE_PERCENT) return null
  // Sollte onvista eine Anleihe einmal nicht in Prozent notieren, lieber nichts liefern als eine
  // um den Faktor 100 falsche Bewertung.
  if (unitType !== 'PCT') return null
  return value / 100
}

export async function getBondQuote(isin: string): Promise<BondQuote | null> {
  const snap = await getSnapshot(isin)
  const price = fromPercent(snap?.quote?.last, snap?.quote?.unitType)
  // Die Währung kommt aus der STÜCKELUNG der Anleihe, nicht vom Handelsplatz - siehe
  // Erklärung an denominationCurrency.
  const currency = denominationCurrency(snap)
  const entityValue = snap?.instrument?.entityValue
  const idNotation = snap?.quote?.market?.idNotation
  const name = snap?.instrument?.name
  if (
    price === null ||
    typeof currency !== 'string' ||
    typeof entityValue !== 'string' ||
    typeof idNotation !== 'number'
  ) {
    return null
  }
  // Der ISO-Code ist die belastbarere Angabe; der deutsche Name dient nur als Rückfallebene,
  // falls onvista den Code einmal nicht mitliefert.
  const iso = snap?.bondsIssuer?.isoCountry
  const nameCountry = snap?.bondsIssuer?.nameCountry
  const country =
    (typeof iso === 'string' ? countryFromIsoCode(iso) : null) ??
    (typeof nameCountry === 'string' ? canonicalCountry(nameCountry) : null)

  return {
    price,
    currency,
    name: typeof name === 'string' ? name : isin,
    entityValue,
    idNotation,
    country
  }
}

interface EodHistory {
  datetimeLast?: unknown
  last?: unknown
  unitType?: unknown
}

export interface BondHistory {
  currency: string
  points: { date: string; price: number }[]
}

/**
 * Tages-Schlusskurse ab fromDate. onvista liefert zwei parallele Arrays (Zeitstempel in Sekunden,
 * Kurse); die Historie reicht nur so weit zurück, wie die Anleihe an dem Platz notiert wird -
 * datetimeStartAvailableHistory begrenzt das, ein früheres startDate wird stillschweigend
 * zurechtgestutzt.
 */
export async function getBondHistory(isin: string, fromDate: string): Promise<BondHistory | null> {
  const quote = await getBondQuote(isin)
  if (!quote) return null
  const data = (await getJson(
    `${BASE}/instruments/BOND/${quote.entityValue}/eod_history` +
      `?idNotation=${quote.idNotation}&range=Y10&startDate=${fromDate}`
  )) as EodHistory | null

  const times = data?.datetimeLast
  const prices = data?.last
  if (!Array.isArray(times) || !Array.isArray(prices) || times.length !== prices.length) return null

  const points: { date: string; price: number }[] = []
  for (let i = 0; i < times.length; i++) {
    const seconds = times[i]
    const price = fromPercent(prices[i], data?.unitType)
    if (typeof seconds !== 'number' || price === null) continue
    points.push({ date: new Date(seconds * 1000).toISOString().slice(0, 10), price })
  }
  if (points.length === 0) return null

  // Bewusst die Währung aus getBondQuote (= Stückelung) statt data.isoCurrency: der
  // Verlaufs-Endpunkt etikettiert nach Handelsplatz und würde dieselbe Reihe je nach
  // Abrufzeitpunkt mal in Dollar, mal in Euro ausweisen.
  return {
    currency: quote.currency,
    points: points.sort((a, b) => a.date.localeCompare(b.date))
  }
}
