/**
 * Vergleichsmaßstäbe für den Analyse-Bereich: die Bausteine, die Modellgewichte und die reine
 * Mathematik dahinter. Bewusst ohne Datenbank- oder React-Bezug, damit sich alles hier einzeln
 * nachrechnen lässt (wie schon bei savingsCalc.ts).
 *
 * Alle Kursreihen, die hier hineingehen, sind bereits in Euro und ausschüttungsbereinigt.
 */

export type BenchmarkComponent =
  | 'EQUITY'
  | 'EQUITY_WORLD'
  | 'BOND_AGG'
  | 'BOND_LONG'
  | 'BOND_MID'
  | 'GOLD'
  | 'COMMODITY'
  | 'CRYPTO'

export type BenchmarkUniverse = 'US' | 'GLOBAL'

export interface BenchmarkComponentDef {
  identifier: string
  label: string
  /** Nur beim Aktienbaustein gesetzt: Schluessel fuer die Laenderaufteilung bei onvista. Ohne ihn
   *  laesst sich die Zusammensetzung des Index nicht abfragen (siehe etfCompositionService). */
  isin?: string
}

/**
 * Die konkreten Wertpapiere je Baustein.
 *
 * US ist die Zusammensetzung, die den gängigen Modellbeschreibungen zugrunde liegt - damit sind
 * die Zahlen mit veröffentlichten Kennzahlen vergleichbar. Alle Reihen notieren in Dollar und
 * werden nach Euro umgerechnet, so wie ein Euro-Anleger sie real erlebt hätte.
 *
 * GLOBAL ist die Sicht eines europäischen Anlegers: MSCI World statt S&P 500, Euro-Anleihen statt
 * US-Staatsanleihen. Alle Reihen notieren bereits in Euro, hier entfällt jede Umrechnung.
 *
 * BITCOIN steht in keinem der fest eingebauten Modelle - der Baustein existiert für eigene Modelle.
 * Seine Reihe hat als einzige auch an Wochenenden Kurse. buildModelSeries schreibt die übrigen
 * Bausteine an diesen Tagen mit ihrem letzten Kurs fort, ein Modell mit Bitcoin bewegt sich also
 * auch samstags - genau wie ein real geführtes Depot, das Bitcoin hält.
 */
export const BENCHMARK_UNIVERSES: Record<
  BenchmarkUniverse,
  Record<BenchmarkComponent, BenchmarkComponentDef>
> = {
  US: {
    EQUITY: { identifier: 'SPY', label: 'S&P 500 (SPY)', isin: 'US78462F1030' },
    EQUITY_WORLD: {
      identifier: 'VT',
      label: 'Aktien weltweit, FTSE Global All Cap (VT)',
      isin: 'US9220427424'
    },
    BOND_AGG: { identifier: 'AGG', label: 'US-Anleihen breit (AGG)' },
    BOND_LONG: { identifier: 'TLT', label: 'US-Staatsanleihen 20+ J. (TLT)' },
    BOND_MID: { identifier: 'IEF', label: 'US-Staatsanleihen 7-10 J. (IEF)' },
    GOLD: { identifier: 'GLD', label: 'Gold (GLD)' },
    COMMODITY: { identifier: 'DBC', label: 'Rohstoffe (DBC)' },
    CRYPTO: { identifier: 'BTC-USD', label: 'Bitcoin (BTC-USD)' }
  },
  GLOBAL: {
    EQUITY: { identifier: 'IWDA.AS', label: 'MSCI World (IWDA)', isin: 'IE00B4L5Y983' },
    EQUITY_WORLD: {
      identifier: 'VWRL.AS',
      label: 'Aktien weltweit, FTSE All-World (VWRL)',
      isin: 'IE00B3RBWM25'
    },
    BOND_AGG: { identifier: 'EUNA.DE', label: 'Anleihen global, €-gesichert (EUNA)' },
    BOND_LONG: { identifier: 'IBCL.DE', label: '€-Staatsanleihen 15-30 J. (IBCL)' },
    BOND_MID: { identifier: 'EUN9.DE', label: '€-Staatsanleihen 5-7 J. (EUN9)' },
    GOLD: { identifier: '4GLD.DE', label: 'Gold (Xetra-Gold)' },
    COMMODITY: { identifier: 'EXXY.DE', label: 'Rohstoffe (EXXY)' },
    CRYPTO: { identifier: 'BTC-EUR', label: 'Bitcoin (BTC-EUR)' }
  }
}

export const UNIVERSE_LABELS: Record<BenchmarkUniverse, string> = {
  US: 'US',
  GLOBAL: 'Global'
}

/** Alle Bausteine in der Reihenfolge, in der sie geladen und im Formular gezeigt werden. */
export const BENCHMARK_COMPONENTS: BenchmarkComponent[] = [
  'EQUITY',
  'EQUITY_WORLD',
  'BOND_AGG',
  'BOND_LONG',
  'BOND_MID',
  'GOLD',
  'COMMODITY',
  'CRYPTO'
]

/** Kurzbezeichnung eines Bausteins - für das Formular eigener Modelle und die Gewichtszeile. */
export const COMPONENT_LABELS: Record<BenchmarkComponent, string> = {
  EQUITY: 'Aktien',
  EQUITY_WORLD: 'Aktien weltweit',
  BOND_AGG: 'Anleihen breit',
  BOND_LONG: 'Anleihen lang',
  BOND_MID: 'Anleihen mittel',
  GOLD: 'Gold',
  COMMODITY: 'Rohstoffe',
  CRYPTO: 'Bitcoin'
}

/**
 * Die Bausteine, die Aktien halten - für sie gibt es eine Sektor- und Länderaufteilung.
 *
 * Gebraucht an zwei Stellen: beim Nachladen der Indexzusammensetzungen und im
 * Zusammensetzungs-Vergleich, der für jedes Modell den Index heranzieht, auf dem es tatsächlich
 * aufbaut - für den norwegischen Staatsfonds ist das nicht derselbe wie für 60/40.
 */
export const EQUITY_COMPONENTS: BenchmarkComponent[] = ['EQUITY', 'EQUITY_WORLD']

/** Gewichte eines Modells je Baustein, als Anteil von 1 (0.6 = 60 %). */
export type BenchmarkWeights = Partial<Record<BenchmarkComponent, number>>

export type BenchmarkModelId = 'INDEX' | 'M60_40' | 'M70_30' | 'M80_20' | 'ALL_WEATHER' | 'NBIM'

export interface BenchmarkModel {
  id: BenchmarkModelId
  /** Beschriftung je Universum - im globalen Universum ist der Aktienbaustein nicht der S&P 500. */
  label: Record<BenchmarkUniverse, string>
  description: string
  weights: BenchmarkWeights
}

export const BENCHMARK_MODELS: BenchmarkModel[] = [
  {
    id: 'INDEX',
    label: { US: 'S&P 500', GLOBAL: 'MSCI World' },
    description: '100 % Aktien, keine Anleihen',
    weights: { EQUITY: 1 }
  },
  {
    id: 'M60_40',
    label: { US: '60/40', GLOBAL: '60/40' },
    description: '60 % Aktien, 40 % Anleihen - das Referenzmodell',
    weights: { EQUITY: 0.6, BOND_AGG: 0.4 }
  },
  {
    id: 'M70_30',
    label: { US: '70/30', GLOBAL: '70/30' },
    description: '70 % Aktien, 30 % Anleihen',
    weights: { EQUITY: 0.7, BOND_AGG: 0.3 }
  },
  {
    id: 'M80_20',
    label: { US: '80/20', GLOBAL: '80/20' },
    description: '80 % Aktien, 20 % Anleihen',
    weights: { EQUITY: 0.8, BOND_AGG: 0.2 }
  },
  {
    id: 'ALL_WEATHER',
    label: { US: 'All Weather', GLOBAL: 'All Weather' },
    description:
      'Ray Dalio: 30 % Aktien, 40 % lange und 15 % mittlere Staatsanleihen, je 7,5 % Gold und Rohstoffe',
    weights: { EQUITY: 0.3, BOND_LONG: 0.4, BOND_MID: 0.15, GOLD: 0.075, COMMODITY: 0.075 }
  },
  {
    /**
     * Der norwegische Staatsfonds (Government Pension Fund Global, verwaltet von NBIM) - der
     * größte Staatsfonds der Welt und eines der wenigen Großdepots, dessen Aufteilung öffentlich
     * und über Jahrzehnte stabil ist.
     *
     * Sein Mandat schreibt 70 % Aktien und 30 % Anleihen vor. Der Aktienteil ist bewusst NICHT
     * derselbe Baustein wie beim 70/30-Modell: der Fonds bildet den FTSE Global All Cap ab, also
     * alle Länder einschließlich Schwellenländern und kleiner Unternehmen, während 70/30 hier auf
     * dem S&P 500 bzw. dem MSCI World aufsetzt. Ohne diesen Unterschied wären beide Linien
     * deckungsgleich und der Vergleich wertlos.
     *
     * Nicht abgebildet: die knapp 2 % nicht börsennotierte Immobilien und Windparks. Dafür gibt es
     * hier keinen Baustein, und sie auf Aktien oder Anleihen umzulegen wäre geraten.
     */
    id: 'NBIM',
    label: { US: 'Norwegischer Staatsfonds', GLOBAL: 'Norwegischer Staatsfonds' },
    description: '70 % Aktien weltweit, 30 % Anleihen - das Mandat des größten Staatsfonds',
    weights: { EQUITY_WORLD: 0.7, BOND_AGG: 0.3 }
  }
]

/** Alle Bausteine, die ein Modell tatsächlich braucht. */
export function componentsOf(model: { weights: BenchmarkWeights }): BenchmarkComponent[] {
  return (Object.keys(model.weights) as BenchmarkComponent[]).filter(
    (c) => (model.weights[c] ?? 0) > 0
  )
}

// ---------------------------------------------------------------------------
// Eigene Modelle
// ---------------------------------------------------------------------------

/**
 * Ein selbst angelegtes Modell: derselbe Baukasten wie bei den festen Modellen, nur mit frei
 * gewählten Gewichten.
 *
 * Bewusst über dieselben sechs Bausteine und nicht über frei wählbare Wertpapiere: für die
 * Bausteine liegen die ausschüttungsbereinigten Kursreihen bereits vor und sind in beiden
 * Universen definiert. Ein beliebiges Papier müsste erst nachgeladen werden und hätte im
 * US- und im Global-Universum dieselbe Reihe - der Umschalter wäre für dieses Modell wirkungslos.
 */
export interface CustomBenchmarkModel {
  id: number
  name: string
  weights: BenchmarkWeights
  createdAt: string
  updatedAt: string
}

export interface NewCustomBenchmarkModel {
  name: string
  weights: BenchmarkWeights
}

export type CustomBenchmarkModelUpdate = NewCustomBenchmarkModel & { id: number }

/**
 * Ein Modell so, wie der Vergleich es braucht - gleichgültig ob fest eingebaut oder selbst
 * angelegt. `key` ist zugleich die Kennung der Linie im Diagramm und der Zeile in der Tabelle.
 */
export interface ComparableModel {
  key: string
  label: string
  description: string
  weights: BenchmarkWeights
  isCustom: boolean
}

export function customModelKey(id: number): string {
  return `custom:${id}`
}

export function weightsSum(weights: BenchmarkWeights): number {
  return BENCHMARK_COMPONENTS.reduce((sum, c) => sum + (weights[c] ?? 0), 0)
}

/**
 * Gewichte auf Summe 1 bringen.
 *
 * Nötig, weil buildModelSeries bei jedem Rebalancing genau den gewichteten Anteil des Gesamtwerts
 * neu anlegt: eine Summe von 0,98 hieße, dass Jahr für Jahr 2 % des Modelldepots verschwinden,
 * statt als Rest liegen zu bleiben. Bei Summe 0 bleibt nichts übrig, womit sich rechnen ließe.
 */
export function normalizeWeights(weights: BenchmarkWeights): BenchmarkWeights {
  const sum = weightsSum(weights)
  if (sum <= 0) return {}
  const out: BenchmarkWeights = {}
  for (const c of BENCHMARK_COMPONENTS) {
    const w = weights[c] ?? 0
    if (w > 0) out[c] = w / sum
  }
  return out
}

/** Gewichte als Zeile, z.B. "60 % Aktien · 40 % Anleihen breit". */
export function describeWeights(weights: BenchmarkWeights): string {
  return BENCHMARK_COMPONENTS.filter((c) => (weights[c] ?? 0) > 0)
    .map((c) => `${Math.round((weights[c] ?? 0) * 1000) / 10} % ${COMPONENT_LABELS[c]}`)
    .join(' · ')
}

/** Alle Modelle eines Universums: erst die fest eingebauten, dann die eigenen. */
export function comparableModels(
  universe: BenchmarkUniverse,
  custom: CustomBenchmarkModel[] = []
): ComparableModel[] {
  return [
    ...BENCHMARK_MODELS.map((m) => ({
      key: m.id as string,
      label: m.label[universe],
      description: m.description,
      weights: m.weights,
      isCustom: false
    })),
    ...custom.map((m) => ({
      key: customModelKey(m.id),
      label: m.name,
      description: describeWeights(m.weights),
      weights: m.weights,
      isCustom: true
    }))
  ]
}

export interface SeriesPoint {
  date: string
  value: number
}

// ---------------------------------------------------------------------------
// Modellreihen
// ---------------------------------------------------------------------------

/** Aufsteigend sortierte Vereinigung mehrerer Datumsreihen, ohne Duplikate. */
function unionDates(seriesList: SeriesPoint[][]): string[] {
  const set = new Set<string>()
  for (const series of seriesList) for (const p of series) set.add(p.date)
  return [...set].sort()
}

/**
 * Wert eines Modellportfolios über die Zeit, ausgehend von 100 am ersten Tag.
 *
 * Anteilsbasiert gerechnet, nicht über gemittelte Renditen: beim Start und an jedem
 * Rebalancing-Termin werden aus dem aktuellen Gesamtwert die Anteile je Baustein neu bestimmt
 * (`anteile_i = gewicht_i · gesamtwert / kurs_i`), dazwischen bleiben sie unverändert. Genau so
 * verhält sich ein real geführtes Depot - die Gewichte driften zwischen den Terminen auseinander,
 * und genau diese Drift ist der Unterschied zwischen einem Modell mit und ohne Rebalancing.
 *
 * Handelsfreie Tage einzelner Bausteine (unterschiedliche Feiertage an unterschiedlichen Börsen)
 * werden mit dem letzten bekannten Kurs überbrückt. Die Reihe beginnt erst, wenn JEDER benötigte
 * Baustein einen Kurs hat.
 */
export function buildModelSeries(
  parts: { weight: number; points: SeriesPoint[] }[],
  rebalanceAnnually = true
): SeriesPoint[] {
  const used = parts.filter((p) => p.weight > 0)
  if (used.length === 0 || used.some((p) => p.points.length === 0)) return []

  const start = used.reduce(
    (latest, p) => (p.points[0].date > latest ? p.points[0].date : latest),
    used[0].points[0].date
  )
  const dates = unionDates(used.map((p) => p.points)).filter((d) => d >= start)
  if (dates.length === 0) return []

  const cursors = used.map(() => 0)
  const prices = used.map(() => 0)
  const units = used.map(() => 0)

  const out: SeriesPoint[] = []
  let currentYear = ''

  for (const date of dates) {
    for (let i = 0; i < used.length; i++) {
      const points = used[i].points
      while (cursors[i] + 1 < points.length && points[cursors[i] + 1].date <= date) cursors[i]++
      if (points[cursors[i]].date <= date) prices[i] = points[cursors[i]].value
    }
    if (prices.some((p) => p <= 0)) continue

    const year = date.slice(0, 4)
    const isFirst = out.length === 0
    const isRebalance = isFirst || (rebalanceAnnually && year !== currentYear)

    if (isRebalance) {
      const total = isFirst ? 100 : units.reduce((sum, u, i) => sum + u * prices[i], 0)
      for (let i = 0; i < used.length; i++) units[i] = (used[i].weight * total) / prices[i]
      currentYear = year
    }

    out.push({ date, value: units.reduce((sum, u, i) => sum + u * prices[i], 0) })
  }

  return out
}

/** Reihe so skalieren, dass der erste Punkt 100 ist - erst dadurch sind zwei Reihen vergleichbar. */
export function normalizeToIndex(points: SeriesPoint[], fromDate?: string): SeriesPoint[] {
  const relevant = fromDate ? points.filter((p) => p.date >= fromDate) : points
  if (relevant.length === 0) return []
  const base = relevant[0].value
  if (base <= 0) return []
  return relevant.map((p) => ({ date: p.date, value: (p.value / base) * 100 }))
}

// ---------------------------------------------------------------------------
// Kennzahlen
// ---------------------------------------------------------------------------

export interface SeriesMetrics {
  /** Gesamtrendite im Zeitraum in Prozent (z.B. 12.3 für +12,3 %). */
  totalReturn: number
  /** Rendite pro Jahr in Prozent; null bei Zeiträumen unter drei Monaten (dort ohne Aussage). */
  cagr: number | null
  /** Tiefster Rückgang vom bisherigen Höchststand, in Prozent und negativ. */
  maxDrawdown: number
  /** Schwankungsbreite der Tagesrenditen, auf ein Jahr hochgerechnet, in Prozent. */
  volatility: number | null
  /** Rendite je Einheit Schwankung. Risikofreier Zins mit 0 angesetzt - im UI so beschriftet. */
  sharpe: number | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
/** Rückfall, wenn sich die Beobachtungsdichte einer Reihe nicht bestimmen lässt. */
const TRADING_DAYS_PER_YEAR = 252
const MIN_DAYS_FOR_ANNUALISING = 90

function yearsBetween(firstDate: string, lastDate: string): number {
  const ms = Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)
  return ms / MS_PER_DAY / 365.25
}

export function seriesMetrics(points: SeriesPoint[]): SeriesMetrics | null {
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  if (first.value <= 0) return null

  const totalReturn = (last.value / first.value - 1) * 100

  const days =
    (Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${first.date}T00:00:00Z`)) / MS_PER_DAY
  const years = yearsBetween(first.date, last.date)
  const cagr =
    days >= MIN_DAYS_FOR_ANNUALISING && years > 0
      ? (Math.pow(last.value / first.value, 1 / years) - 1) * 100
      : null

  let peak = first.value
  let maxDrawdown = 0
  const returns: number[] = []
  for (let i = 0; i < points.length; i++) {
    const v = points[i].value
    if (v > peak) peak = v
    if (peak > 0) {
      const dd = (v / peak - 1) * 100
      if (dd < maxDrawdown) maxDrawdown = dd
    }
    if (i > 0 && points[i - 1].value > 0) returns.push(v / points[i - 1].value - 1)
  }

  let volatility: number | null = null
  if (returns.length >= 20) {
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
    // Hochgerechnet mit der Beobachtungsdichte DIESER Reihe, nicht mit festen 252 Handelstagen.
    // Nötig, seit Bitcoin ein Baustein sein kann: dessen Kurse gibt es auch am Wochenende, ein
    // Modell mit Bitcoin kommt damit auf ~365 Punkte im Jahr - und das eigene Depot wird ohnehin
    // für jeden Kalendertag gerechnet. Mit fester 252er-Hochrechnung sähe jede Reihe mit
    // Wochenendtagen ruhiger aus als eine reine Börsenreihe (100 % Bitcoin: 38,8 % statt 46,7 %),
    // obwohl sie es nicht ist - und in der Vergleichstabelle stehen genau diese beiden
    // nebeneinander. Bei einer reinen Handelstagsreihe ergibt die Dichte wieder ~252, dort ändert
    // sich dadurch nichts.
    const periodsPerYear = years > 0 ? returns.length / years : TRADING_DAYS_PER_YEAR
    volatility = Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100
  }

  const sharpe = cagr !== null && volatility !== null && volatility > 0 ? cagr / volatility : null

  return { totalReturn, cagr, maxDrawdown, volatility, sharpe }
}

// ---------------------------------------------------------------------------
// Euro-Vergleich: dieselben Einzahlungen in den Vergleichsmaßstab
// ---------------------------------------------------------------------------

export interface CashFlow {
  date: string
  /** Positiv = Einzahlung ins Depot, negativ = Entnahme. In Euro. */
  amount: number
}

export interface ContributionSimulation {
  /** Summe der Einzahlungen abzüglich Entnahmen, in Euro. */
  netInvested: number
  /** Was daraus im Vergleichsmaßstab geworden wäre, in Euro. */
  finalValue: number
}

/**
 * Was wäre aus denselben Einzahlungen geworden, wenn statt der eigenen Auswahl stur der
 * Vergleichsmaßstab bespart worden wäre?
 *
 * Jeder Zufluss kauft am selben Tag Anteile zum dortigen Kurs, jeder Abfluss verkauft welche.
 * Ist an einem Tag kein Kurs vorhanden (Wochenende, Feiertag), gilt der letzte davor; liegt die
 * Zahlung noch vor dem allerersten Kurspunkt, gilt dieser erste Kurs.
 */
export function simulateContributions(
  flows: CashFlow[],
  benchmark: SeriesPoint[]
): ContributionSimulation | null {
  if (benchmark.length === 0) return null
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))

  let cursor = 0
  let units = 0
  let netInvested = 0

  for (const flow of sorted) {
    // Kein Ueberspringen von Zahlungen vor dem ersten Kurspunkt: die kaufen zum ersten
    // verfuegbaren Kurs. Genau das passiert auch real - eine Order am Neujahrstag wird am naechsten
    // Handelstag ausgefuehrt. Vorher wurde der Startwert des Depots stillschweigend verschluckt,
    // sobald der Zeitraum auf einen Feiertag fiel; gemessen fehlten dadurch 6.911 von 26.567 Euro,
    // und der Vergleichsmassstab sah um 26 % schlechter aus als er war.
    while (cursor + 1 < benchmark.length && benchmark[cursor + 1].date <= flow.date) cursor++
    const price = benchmark[cursor].value
    if (price <= 0) continue

    if (flow.amount < 0) {
      // Nicht mehr verkaufen als vorhanden - sonst entstünde eine negative Stückzahl, die den
      // Endwert künstlich anheben würde.
      const soldUnits = Math.min(units, -flow.amount / price)
      units -= soldUnits
      netInvested -= soldUnits * price
    } else {
      units += flow.amount / price
      netInvested += flow.amount
    }
  }

  return { netInvested, finalValue: units * benchmark[benchmark.length - 1].value }
}
