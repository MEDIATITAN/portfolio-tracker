import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BENCHMARK_COMPONENTS,
  buildModelSeries,
  comparableModels,
  componentsOf,
  customModelKey,
  normalizeToIndex,
  normalizeWeights,
  seriesMetrics,
  simulateContributions,
  UNIVERSE_LABELS,
  type BenchmarkUniverse,
  type ComparableModel,
  type CustomBenchmarkModel,
  type NewCustomBenchmarkModel,
  type SeriesPoint
} from '@shared/benchmarkCalc'
import { computeAllPositionValues } from '@shared/valueCalc'
import type { AnalysisPrepareProgress } from '@shared/types'
import { api } from '../lib/api'
import {
  useBenchmarks,
  useCreateCustomModel,
  useCustomModels,
  useDeleteCustomModel,
  useEtfComposition,
  useFxRates,
  useHistoricalData,
  usePositions,
  usePrepareAnalysis,
  usePriceCache,
  useTransactions,
  useUpdateCustomModel
} from '../lib/queries'
import { buildPriceEurLookup } from '../lib/historicalSeries'
import { buildPortfolioSeries } from '../lib/portfolioReturnSeries'
import type { AnalysisSeries } from '../lib/analysisSeries'
import {
  ANALYSIS_RANGE_LABELS,
  ANALYSIS_RANGE_ORDER,
  analysisRangeStart,
  type AnalysisRange
} from '../lib/analysisRange'
import { loadModelSelection, saveModelSelection } from '../lib/modelSelection'
import { formatDate } from '../lib/format'
import { BenchmarkChart } from '../components/analysis/BenchmarkChart'
import { ComparisonTable } from '../components/analysis/ComparisonTable'
import { CompositionCompare } from '../components/analysis/CompositionCompare'
import { ContributionCard, type AlternativeOutcome } from '../components/analysis/ContributionCard'
import { CustomModelForm } from '../components/analysis/CustomModelForm'
import { DataQualityNote } from '../components/analysis/DataQualityNote'
import { ModelPicker } from '../components/analysis/ModelPicker'

const UNIVERSES: BenchmarkUniverse[] = ['US', 'GLOBAL']

const UNIVERSE_HINTS: Record<BenchmarkUniverse, string> = {
  US: 'S&P 500 und US-Anleihen, in Euro umgerechnet – die Zusammensetzung, auf die sich die gängigen Modellkennzahlen beziehen.',
  GLOBAL:
    'MSCI World und Euro-Anleihen – näher an dem, was hier tatsächlich kaufbar ist, und ohne Dollar-Effekt.'
}

/** Die beiden Sichten des Bereichs: Verlauf über die Zeit und Aufteilung im Hier und Jetzt. */
type AnalysisTab = 'PERFORMANCE' | 'COMPOSITION'

const TAB_LABELS: Record<AnalysisTab, string> = {
  PERFORMANCE: 'Wertentwicklung',
  COMPOSITION: 'Zusammensetzung'
}

/** Welches Modell gerade bearbeitet wird: keines, ein neues, oder ein vorhandenes. */
type ModelEditor = { mode: 'NEW' } | { mode: 'EDIT'; model: CustomBenchmarkModel } | null

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const toggleGroupClass = 'flex gap-1 rounded-md bg-slate-200 p-1 dark:bg-slate-800'

function toggleClass(active: boolean): string {
  return `rounded px-2.5 py-1 text-xs font-medium ${
    active
      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
  }`
}

export function AnalysePage(): React.JSX.Element {
  const [tab, setTab] = useState<AnalysisTab>('PERFORMANCE')
  const [universe, setUniverse] = useState<BenchmarkUniverse>('US')
  const [range, setRange] = useState<AnalysisRange>('1J')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<AnalysisPrepareProgress | null>(null)
  const [editor, setEditor] = useState<ModelEditor>(null)

  const { data: positions } = usePositions()
  const { data: transactions } = useTransactions()
  const { data: historical } = useHistoricalData()
  const { data: priceCache } = usePriceCache()
  const { data: fxRates } = useFxRates()
  const { data: compositions } = useEtfComposition()
  const { data: customModels } = useCustomModels()
  const createModel = useCreateCustomModel()
  const updateModel = useUpdateCustomModel()
  const deleteModel = useDeleteCustomModel()

  // Alle Modelle, aus denen sich der Vergleich zusammensetzen lässt: die fest eingebauten und die
  // eigenen. Die Beschriftung hängt am Universum - dort heißt derselbe Aktienbaustein anders.
  const allModels = useMemo(
    () => comparableModels(universe, customModels ?? []),
    [universe, customModels]
  )

  // Ohne gespeicherte Auswahl sind alle fest eingebauten Modelle dabei - so sah der Bereich aus,
  // bevor es die Auswahl gab.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const stored = loadModelSelection()
    if (stored !== null) return new Set(stored)
    return new Set(comparableModels('US').map((m) => m.key))
  })

  function changeSelection(update: (current: Set<string>) => Set<string>): void {
    setSelected((current) => {
      const next = update(current)
      saveModelSelection([...next])
      return next
    })
  }

  // Frühester Tag, an dem überhaupt etwas gehalten wurde - die Grenze für "Maximal".
  const earliestHoldingDay = useMemo(() => {
    let earliest = today()
    for (const t of transactions ?? []) {
      const day = t.date.slice(0, 10)
      if (day < earliest) earliest = day
    }
    for (const p of positions ?? []) {
      if (p.assetClass === 'CASH_OTHER' || !p.identifier) continue
      const day = (p.purchaseDate ?? p.createdAt).slice(0, 10)
      if (day < earliest) earliest = day
    }
    return earliest
  }, [positions, transactions])

  const fromDay = analysisRangeStart(range, earliestHoldingDay)
  const { data: benchmarks, isLoading } = useBenchmarks(universe, fromDay)
  const prepare = usePrepareAnalysis()

  useEffect(() => api.analyse.onPrepareProgress(setProgress), [])

  // Reicht eine Reihe nicht bis zum Anfang des Zeitraums, ist das genauso ein Grund nachzuladen wie
  // eine ganz fehlende: sonst zeigt ein Wechsel von "1 Jahr" auf "3 Jahre" stillschweigend weiter
  // nur ein Jahr. Die Toleranz fängt Wochenenden und Feiertage ab - der erste Kurstag liegt fast nie
  // exakt auf dem angefragten Datum.
  const shortByDays =
    benchmarks?.coversFrom == null
      ? 0
      : (Date.parse(benchmarks.coversFrom + 'T00:00:00Z') - Date.parse(fromDay + 'T00:00:00Z')) /
        86_400_000
  const needsData = benchmarks !== undefined && (benchmarks.missing.length > 0 || shortByDays > 5)

  // Ohne den Vermerk liefe der Abruf nach jedem Ergebnis erneut, wenn eine Quelle gar nicht so weit
  // zurückreicht wie angefragt.
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (!needsData || prepare.isPending) return
    const key = `${universe}|${fromDay}`
    if (attempted.current.has(key)) return
    attempted.current.add(key)
    prepare.mutate({ universe, fromDate: fromDay })
  }, [needsData, universe, fromDay, prepare])

  const analysis = useMemo(() => {
    if (!positions || !transactions || !historical || !benchmarks) return null

    const priceEur = buildPriceEurLookup(historical.prices, historical.fxRates)
    const pointsByComponent = new Map(
      benchmarks.series.map((s) => [s.component, s.points.filter((p) => p.date >= fromDay)])
    )

    // Ein Modell lässt sich nur rechnen, wenn JEDER seiner Bausteine Kurse hat - sonst fehlte in
    // der Mischung ein Teil, und die Linie wäre stillschweigend ein anderes Modell. Geprüft wird
    // für alle Modelle, nicht nur für die ausgewählten: die Auswahlliste sagt sonst nicht, warum
    // ein angehaktes Modell im Diagramm fehlt.
    const unavailable = new Set<string>()
    const models: { key: string; label: string; raw: SeriesPoint[] }[] = []

    for (const model of allModels) {
      const weights = normalizeWeights(model.weights)
      const parts = componentsOf({ weights }).map((c) => ({
        weight: weights[c] ?? 0,
        points: pointsByComponent.get(c) ?? []
      }))
      if (parts.length === 0 || parts.some((p) => p.points.length === 0)) {
        unavailable.add(model.key)
        continue
      }
      if (!selected.has(model.key)) continue
      const raw = buildModelSeries(parts)
      if (raw.length > 0) models.push({ key: model.key, label: model.label, raw })
    }

    const toDay = today()
    let portfolio = buildPortfolioSeries({ positions, transactions, priceEur, fromDay, toDay })

    // Alle Linien müssen am selben Tag bei 100 starten, sonst vergleicht man verschiedene
    // Zeiträume miteinander. Maßgeblich ist der späteste Beginn.
    const modelStart = models.reduce(
      (latest, m) => (m.raw[0].date > latest ? m.raw[0].date : latest),
      fromDay
    )
    const portfolioStart = portfolio.index[0]?.date ?? fromDay
    const commonStart = modelStart > portfolioStart ? modelStart : portfolioStart
    if (commonStart > portfolioStart) {
      portfolio = buildPortfolioSeries({
        positions,
        transactions,
        priceEur,
        fromDay: commonStart,
        toDay
      })
    }

    const series: AnalysisSeries[] = [
      {
        key: 'DEPOT',
        label: 'Dein Depot',
        points: normalizeToIndex(portfolio.index, commonStart),
        metrics: null,
        isPortfolio: true
      },
      ...models.map((m) => ({
        key: m.key,
        label: m.label,
        points: normalizeToIndex(m.raw, commonStart),
        metrics: null,
        isPortfolio: false
      }))
    ]
    for (const s of series) s.metrics = seriesMetrics(s.points)

    const alternatives: AlternativeOutcome[] = []
    for (const m of models) {
      const simulated = simulateContributions(
        portfolio.flows,
        m.raw.filter((p) => p.date >= commonStart)
      )
      if (simulated)
        alternatives.push({ key: m.key, label: m.label, finalValue: simulated.finalValue })
    }

    return {
      series,
      alternatives,
      unavailable,
      commonStart,
      netInvested: portfolio.flows.reduce((sum, f) => sum + f.amount, 0),
      portfolioValue: portfolio.value.at(-1)?.value ?? 0,
      withoutPrices: portfolio.withoutPrices,
      hasPortfolio: series[0].points.length > 1
    }
  }, [positions, transactions, historical, benchmarks, fromDay, allModels, selected])

  const values = useMemo(
    () => computeAllPositionValues(positions ?? [], priceCache ?? [], fxRates ?? []),
    [positions, priceCache, fxRates]
  )
  const selectedModels: ComparableModel[] = allModels.filter((m) => selected.has(m.key))

  const toggle = (key: string): void =>
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  function handleSubmitModel(input: NewCustomBenchmarkModel): void {
    if (editor?.mode === 'EDIT') {
      updateModel.mutate({ ...input, id: editor.model.id }, { onSuccess: () => setEditor(null) })
      return
    }
    createModel.mutate(input, {
      // Ein gerade angelegtes Modell steht sofort im Vergleich - alles andere wäre ein zweiter
      // Klick für etwas, das man offensichtlich sehen will.
      onSuccess: (created) => {
        changeSelection((current) => new Set([...current, customModelKey(created.id)]))
        setEditor(null)
      }
    })
  }

  function handleDeleteModel(model: CustomBenchmarkModel): void {
    if (!confirm(`Modell "${model.name}" wirklich löschen?`)) return
    deleteModel.mutate(model.id)
    changeSelection((current) => {
      const next = new Set(current)
      next.delete(customModelKey(model.id))
      return next
    })
    if (editor?.mode === 'EDIT' && editor.model.id === model.id) setEditor(null)
  }

  const busy = prepare.isPending
  const missingCount = benchmarks?.missing.length ?? 0
  const componentCount = BENCHMARK_COMPONENTS.length

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analyse</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dein Depot gegen den Markt und gegen feste Allokationsmodelle
          </p>
        </div>
        <button
          type="button"
          onClick={() => prepare.mutate({ universe, fromDate: fromDay })}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy ? 'Lädt Daten…' : 'Daten aktualisieren'}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className={toggleGroupClass}>
          {(Object.keys(TAB_LABELS) as AnalysisTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={toggleClass(tab === t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'PERFORMANCE' && (
          <div className={toggleGroupClass}>
            {ANALYSIS_RANGE_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={toggleClass(range === r)}
              >
                {ANALYSIS_RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        )}

        <div className={toggleGroupClass}>
          {UNIVERSES.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUniverse(u)}
              title={UNIVERSE_HINTS[u]}
              className={toggleClass(universe === u)}
            >
              {UNIVERSE_LABELS[u]}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">{UNIVERSE_HINTS[universe]}</p>
      </div>

      <ModelPicker
        models={allModels}
        selected={selected}
        onToggle={(key) =>
          changeSelection((current) => {
            const next = new Set(current)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
          })
        }
        unavailable={analysis?.unavailable ?? new Set<string>()}
        customModels={customModels ?? []}
        onCreate={() => setEditor({ mode: 'NEW' })}
        onEdit={(model) => setEditor({ mode: 'EDIT', model })}
        onDelete={handleDeleteModel}
      />

      {editor && (
        <CustomModelForm
          key={editor.mode === 'EDIT' ? editor.model.id : 'new'}
          initial={editor.mode === 'EDIT' ? editor.model : null}
          universe={universe}
          onSubmit={handleSubmitModel}
          onCancel={() => setEditor(null)}
          submitting={createModel.isPending || updateModel.isPending}
        />
      )}

      {busy && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          {progress === null
            ? 'Daten werden geladen…'
            : progress.phase === 'BENCHMARKS'
              ? `Vergleichsreihen: ${progress.label || 'fertig'} (${progress.done}/${progress.total})`
              : `Eigene Kurse werden verlängert: ${progress.label || 'fertig'} (${progress.done}/${progress.total})`}
        </p>
      )}

      {!busy && needsData && missingCount === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Die Vergleichsreihen reichen noch nicht bis zum Anfang dieses Zeitraums. &bdquo;Daten
          aktualisieren&ldquo; holt sie nach.
        </p>
      )}

      {!busy && missingCount > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Für {missingCount} von {componentCount} Vergleichsbausteinen liegen noch keine Kurse vor.
          Modelle, die sie brauchen, fehlen deshalb im Vergleich &ndash; &bdquo;Daten
          aktualisieren&ldquo; holt sie nach.
        </p>
      )}

      {isLoading && (
        <p className="text-sm text-slate-500 dark:text-slate-400">Lade Vergleichsdaten…</p>
      )}

      {tab === 'PERFORMANCE' && analysis && !analysis.hasPortfolio && !busy && (
        <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Für diesen Zeitraum gibt es noch keine auswertbare Depotentwicklung. Ein kürzerer Zeitraum
          hilft meistens.
        </p>
      )}

      {tab === 'PERFORMANCE' && analysis && analysis.hasPortfolio && (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Wertentwicklung ab 100
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                seit {formatDate(analysis.commonStart)}
              </span>
            </div>
            <BenchmarkChart series={analysis.series} hidden={hidden} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <ComparisonTable series={analysis.series} hidden={hidden} onToggle={toggle} />
          </div>

          {analysis.alternatives.length > 0 && (
            <ContributionCard
              netInvested={analysis.netInvested}
              portfolioValue={analysis.portfolioValue}
              alternatives={analysis.alternatives}
              fromDate={analysis.commonStart}
            />
          )}

          <DataQualityNote
            withoutPrices={analysis.withoutPrices}
            actualStart={analysis.commonStart}
            requestedStart={fromDay}
          />
        </>
      )}

      {tab === 'COMPOSITION' &&
        (values.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Noch keine bewerteten Positionen – ohne Bestand gibt es keine Aufteilung zu vergleichen.
          </p>
        ) : (
          <CompositionCompare
            values={values}
            compositions={compositions ?? []}
            models={selectedModels}
            universe={universe}
          />
        ))}
    </div>
  )
}
