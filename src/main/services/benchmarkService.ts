import * as benchmarkRepo from '../db/benchmarkRepo'
import * as historicalRepo from '../db/historicalRepo'
import * as settingsRepo from '../db/settingsRepo'
import * as yahooService from './yahooService'
import * as fxService from './fxService'
import {
  BENCHMARK_COMPONENTS,
  BENCHMARK_UNIVERSES,
  type BenchmarkComponent,
  type BenchmarkUniverse,
  type SeriesPoint
} from '../../shared/benchmarkCalc'
import type { BenchmarkComponentSeries, BenchmarkData } from '../../shared/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Wie alt der jüngste gespeicherte Kurs sein darf, bevor die Reihe verlängert wird. */
function staleBefore(): string {
  return new Date(Date.now() - 3 * DAY_MS).toISOString().slice(0, 10)
}

function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * Kürzester Abstand zwischen zwei Verlängerungsversuchen derselben Reihe.
 *
 * Ohne das liefe bei jedem Öffnen der Analyse-Seite ein Abruf über alle sechs Bausteine, auch
 * wenn die Börse seit dem letzten Mal gar nicht geöffnet hatte.
 */
const MIN_REFETCH_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Lädt fehlende Kurse der Vergleichsmaßstäbe nach.
 *
 * Die Kurse sind ausschüttungsbereinigt (getAdjustedHistory), nicht die reinen Kurse - siehe die
 * Begründung dort. Für Reihen in Fremdwährung werden zusätzlich die Wechselkurse desselben
 * Zeitraums geholt, sonst ließe sich später nicht nach Euro umrechnen.
 */
export async function ensureBenchmarkData(
  universe: BenchmarkUniverse,
  fromDate: string,
  onProgress?: (event: { done: number; total: number; label: string }) => void
): Promise<void> {
  const defs = BENCHMARK_UNIVERSES[universe]
  let done = 0

  for (const component of BENCHMARK_COMPONENTS) {
    const { identifier, label } = defs[component]
    onProgress?.({ done, total: BENCHMARK_COMPONENTS.length, label })
    done++

    const earliest = benchmarkRepo.earliestBenchmarkDate(identifier)
    const latest = benchmarkRepo.latestBenchmarkDate(identifier)
    const needsBackfill = earliest === null || earliest > fromDate
    const needsUpdate = latest === null || latest < staleBefore()
    if (!needsBackfill && !needsUpdate) continue

    const attemptKey = `benchmark_fetched_at:${identifier}`
    if (!needsBackfill) {
      const lastAttempt = settingsRepo.getRawSetting(attemptKey)
      if (lastAttempt !== null && Date.now() - Date.parse(lastAttempt) < MIN_REFETCH_INTERVAL_MS) {
        continue
      }
    }
    settingsRepo.setRawSetting(attemptKey, new Date().toISOString())

    // Reicht die Reihe schon weit genug zurück, wird nur das Ende nachgezogen statt sechs Jahre
    // erneut herunterzuladen.
    const fetchFrom = needsBackfill ? fromDate : shiftDays(latest ?? fromDate, -7)

    try {
      const points = await yahooService.getAdjustedHistory(identifier, fetchFrom)
      if (points.length === 0) continue
      benchmarkRepo.upsertBenchmarkPrices(identifier, points)

      const currency = points[0].currency
      if (currency && currency !== 'EUR') {
        const stored = historicalRepo.listHistoricalFxRates('EUR', currency, fetchFrom)
        const covered = stored.length > 0 && stored[0].date <= shiftDays(fetchFrom, 7)
        if (!covered || needsUpdate) {
          const fxPoints = await fxService.getHistoricalRates('EUR', currency, fetchFrom)
          historicalRepo.upsertHistoricalFxRates('EUR', currency, fxPoints)
        }
      }
    } catch (err) {
      console.error(`Vergleichsreihe ${identifier} konnte nicht geladen werden:`, err)
    }
  }

  onProgress?.({ done, total: BENCHMARK_COMPONENTS.length, label: '' })
}

/**
 * Baut aus einem Wechselkursverlauf eine Nachschlagefunktion "Fremdwährung -> Euro".
 *
 * historical_fx_rates speichert base=EUR, quote=Fremdwährung, also "1 EUR = rate USD". Um einen
 * Preis IN Dollar nach Euro zu bringen, muss man deshalb DURCH den Kurs teilen. Das war an
 * anderer Stelle im Projekt schon einmal ein echter Fehler (siehe historicalSeries.ts).
 */
function buildRateToEur(currency: string, fromDate: string): (date: string) => number | null {
  if (currency === 'EUR') return () => 1

  // Bewusst früher ansetzen: fällt der erste Kurstag auf ein Wochenende, liegt der passende
  // Wechselkurs davor.
  const rates = historicalRepo.listHistoricalFxRates('EUR', currency, shiftDays(fromDate, -14))
  if (rates.length === 0) return () => null

  let cursor = 0
  let lastDate = ''
  return (date) => {
    // Die Aufrufe kommen aufsteigend; springt das Datum zurück, wird von vorn gesucht.
    if (date < lastDate) cursor = 0
    lastDate = date
    while (cursor + 1 < rates.length && rates[cursor + 1].date <= date) cursor++
    if (rates[cursor].date > date) return null
    const rate = rates[cursor].rate
    return rate > 0 ? 1 / rate : null
  }
}

/** Die gespeicherten Vergleichsreihen ab einem Stichtag, umgerechnet in Euro. */
export function getBenchmarkSeries(universe: BenchmarkUniverse, fromDate: string): BenchmarkData {
  const defs = BENCHMARK_UNIVERSES[universe]
  const identifiers = BENCHMARK_COMPONENTS.map((c) => defs[c].identifier)
  const rows = benchmarkRepo.listBenchmarkPrices(identifiers, fromDate)

  const byIdentifier = new Map<string, typeof rows>()
  for (const row of rows) {
    const list = byIdentifier.get(row.identifier)
    if (list) list.push(row)
    else byIdentifier.set(row.identifier, [row])
  }

  const series: BenchmarkComponentSeries[] = []
  const missing: BenchmarkComponent[] = []

  for (const component of BENCHMARK_COMPONENTS) {
    const { identifier, label } = defs[component]
    const raw = byIdentifier.get(identifier)
    if (!raw || raw.length === 0) {
      missing.push(component)
      continue
    }

    const sourceCurrency = raw[0].currency
    const rateToEur = buildRateToEur(sourceCurrency, fromDate)
    const points: SeriesPoint[] = []
    for (const row of raw) {
      const rate = rateToEur(row.date)
      if (rate === null) continue
      points.push({ date: row.date, value: row.price * rate })
    }

    if (points.length === 0) missing.push(component)
    else series.push({ component, identifier, label, sourceCurrency, points })
  }

  const coversFrom = series.reduce<string | null>(
    (latest, s) => (latest === null || s.points[0].date > latest ? s.points[0].date : latest),
    null
  )
  return { universe, series, missing, coversFrom }
}
