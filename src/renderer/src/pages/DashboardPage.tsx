import { useEffect, useState, type CSSProperties } from 'react'
import { computeAllPositionValues, sumTotalEur, totalGainLoss } from '@shared/valueCalc'
import { displayClass } from '@shared/displayClass'
import { NetWorthCard } from '../components/dashboard/NetWorthCard'
import { BreakdownDonut } from '../components/dashboard/BreakdownDonut'
import { ValueOverTimeChart } from '../components/dashboard/ValueOverTimeChart'
import { TopMovers } from '../components/dashboard/TopMovers'
import { HoldingsList } from '../components/dashboard/HoldingsList'
import { RefreshButton } from '../components/common/RefreshButton'
import { ResetProgressPanel } from '../components/positions/ResetProgressPanel'
import { LastUpdatedBadge } from '../components/common/LastUpdatedBadge'
import {
  assetClassBreakdown,
  cashTypeBreakdown,
  positionBreakdown,
  regionBreakdown,
  sectorBreakdown,
  type RegionGrouping
} from '../lib/selectors'
import { ASSET_CLASS_LABELS, formatEur } from '../lib/format'
import { shouldAutoRefresh } from '../lib/autoRefresh'
import type { TimeRange } from '../lib/timeRange'
import { useResetRun } from '../lib/useResetRun'
import type { ClassFilter } from '../lib/navigation'
import {
  useEtfComposition,
  useFxRates,
  useHistoricalData,
  usePositions,
  usePriceCache,
  useRefreshPrices,
  useResetClass,
  useSnapshots
} from '../lib/queries'

type ChartKey = 'assetClass' | 'sector' | 'region' | 'cashType'
type HeroKey = 'positions' | 'time'
/** Alle Diagramme, die sich aufschlüsseln lassen. */
type DonutKey = ChartKey | 'positions'

function flexStyle<K extends string>(key: K, expanded: K | null): CSSProperties {
  if (expanded === null) return { flex: '1 1 0%' }
  return expanded === key ? { flex: '3 1 0%' } : { flex: '1 1 0%' }
}

interface DashboardPageProps {
  classFilter: ClassFilter
  onNavigateToPositions: () => void
}

export function DashboardPage({
  classFilter,
  onNavigateToPositions
}: DashboardPageProps): React.JSX.Element {
  const { data: positions } = usePositions()
  const { data: priceCache } = usePriceCache()
  const { data: fxRates } = useFxRates()
  const { data: snapshots } = useSnapshots()
  const { data: historicalData } = useHistoricalData()
  const { data: etfComposition } = useEtfComposition()
  const refreshPrices = useRefreshPrices()
  const resetClass = useResetClass()
  const resetRun = useResetRun()
  // Der Zeitraum des Wertverlaufs steuert auch die Gewinner/Verlierer-Liste darunter.
  const [range, setRange] = useState<TimeRange>('ALL')
  const [regionGrouping, setRegionGrouping] = useState<RegionGrouping>('country')
  const [expandedChart, setExpandedChart] = useState<ChartKey | null>(null)
  const [expandedHero, setExpandedHero] = useState<HeroKey | null>(null)
  // Nur ein einziger Platz für die Detailansicht: klickt man ein anderes Diagramm an, fällt das
  // vorherige dadurch automatisch auf seine Standardansicht zurück.
  const [drill, setDrill] = useState<{ key: DonutKey; label: string } | null>(null)

  // Kurse automatisch aktualisieren, wenn auf diesen Tab gewechselt wird (mit Bremse gegen
  // API-Spam bei schnellem Hin- und Herklicken - siehe shouldAutoRefresh).
  useEffect(() => {
    if (shouldAutoRefresh()) refreshPrices.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const values = computeAllPositionValues(positions ?? [], priceCache ?? [], fxRates ?? [])
  const filteredValues =
    classFilter === 'ALL' ? values : values.filter((v) => displayClass(v.position) === classFilter)
  const total = sumTotalEur(filteredValues)
  const gainLoss = totalGainLoss(filteredValues)
  const hasPositionsInClass =
    classFilter === 'ALL' || (positions ?? []).some((p) => displayClass(p) === classFilter)
  const hasAnyPositions = (positions ?? []).length > 0
  // Sektoren und Regionen gibt es nur dort, wo sie eine Bedeutung haben: Krypto, Rohstoffe und
  // Cash/Sonstiges haben weder Branchen noch Sitzländer. Anleihen behalten die Regionen (die
  // Länder der Emittenten), aber keine Sektoren - eine Staatsanleihe gehört in keine Branche.
  const showSector = classFilter === 'ALL' || classFilter === 'STOCK_ETF'
  const showRegion = showSector || classFilter === 'BOND'
  const showChartRow = classFilter === 'ALL' || showRegion
  // Gewinner/Verlierer nur dort, wo es genug kursbewegte Positionen für eine Rangliste gibt.
  // Cash hat keine Kurse; Anleihen und Rohstoffe sind je eine Handvoll Positionen, bei denen
  // eine "Top 3" praktisch die ganze Liste wäre.
  const showTopMovers =
    classFilter === 'ALL' || classFilter === 'STOCK_ETF' || classFilter === 'CRYPTO'
  const showCashTypes = classFilter === 'CASH_OTHER'

  function toggle(key: ChartKey): () => void {
    return () => {
      setDrill(null)
      setExpandedChart((prev) => (prev === key ? null : key))
    }
  }

  function toggleHero(key: HeroKey): () => void {
    return () => {
      setDrill(null)
      setExpandedHero((prev) => (prev === key ? null : key))
    }
  }

  /** Verdrahtet ein Diagramm mit dem gemeinsamen Detailansicht-Platz. */
  function drillProps(key: DonutKey): {
    drillLabel: string | null
    onDrillChange: (label: string | null) => void
  } {
    return {
      drillLabel: drill?.key === key ? drill.label : null,
      onDrillChange: (label) => setDrill(label === null ? null : { key, label })
    }
  }

  /**
   * Setzt nur die Kursreihen dieses Bereichs zurück. Der Verlauf des Gesamtvermögens bleibt
   * stehen - er hält alle Bereiche gemeinsam fest, ihn hier zu löschen träfe auch die anderen.
   */
  function handleResetClass(): void {
    if (classFilter === 'ALL' || resetClass.isPending) return
    resetRun.start((callbacks) => resetClass.mutate(classFilter, callbacks))
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {classFilter === 'ALL' ? 'Übersicht' : ASSET_CLASS_LABELS[classFilter]}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Dein Vermögen im Überblick</p>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            {classFilter !== 'ALL' && (
              <button
                type="button"
                onClick={handleResetClass}
                disabled={resetClass.isPending}
                title={`Verwirft die gespeicherten Kursreihen im Bereich ${ASSET_CLASS_LABELS[classFilter]} und holt sie neu. Andere Bereiche und der Vermögensverlauf bleiben unberührt.`}
                className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Kurse zurücksetzen
              </button>
            )}
            <RefreshButton
              onRefresh={() => refreshPrices.mutate()}
              isRefreshing={refreshPrices.isPending}
            />
          </div>
          <LastUpdatedBadge
            updatedCount={refreshPrices.data?.updatedCount ?? null}
            failedIdentifiers={refreshPrices.data?.failedIdentifiers ?? []}
          />
        </div>
      </header>

      {resetRun.visible && (
        <ResetProgressPanel
          entries={resetRun.entries}
          allDone={resetRun.allDone}
          error={resetRun.error}
          fading={resetRun.fading}
        />
      )}

      <NetWorthCard
        title={classFilter === 'ALL' ? 'Gesamtvermögen' : ASSET_CLASS_LABELS[classFilter]}
        totalEur={total}
        gainLossEur={gainLoss.gainLossEur}
        gainLossPercent={gainLoss.percent}
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div
          style={expandedHero ? flexStyle('positions', expandedHero) : { flex: '0 0 380px' }}
          className="min-w-0 transition-all duration-300"
        >
          <BreakdownDonut
            title={classFilter === 'ALL' ? 'Vermögen' : ASSET_CLASS_LABELS[classFilter]}
            data={positionBreakdown(filteredValues)}
            showLegend={false}
            // Beim Vermögen-Diagramm soll der graue Sammelposten klein bleiben: es werden so viele
            // Positionen einzeln gezeigt, dass "Sonstige" höchstens 10% des Rings einnimmt.
            maxOthersShare={0.1}
            height={expandedHero === 'positions' ? 400 : 280}
            centerLabel={{
              value: formatEur(total),
              sub: classFilter === 'ALL' ? 'Gesamtvermögen' : ASSET_CLASS_LABELS[classFilter]
            }}
            expanded={expandedHero === 'positions'}
            onToggleExpand={toggleHero('positions')}
            {...drillProps('positions')}
          />
        </div>
        <div
          style={expandedHero ? flexStyle('time', expandedHero) : { flex: '1 1 0%' }}
          className="min-w-0 transition-all duration-300"
        >
          <ValueOverTimeChart
            snapshots={snapshots ?? []}
            positions={filteredValues.map((v) => v.position)}
            fxRates={fxRates ?? []}
            historicalPrices={historicalData?.prices ?? []}
            historicalFxRates={historicalData?.fxRates ?? []}
            intradayPrices={historicalData?.intraday ?? []}
            assetClassFilter={classFilter}
            hasPositionsInClass={hasPositionsInClass}
            hasAnyPositions={hasAnyPositions}
            gainLossPercent={gainLoss.percent}
            onAddPosition={onNavigateToPositions}
            expanded={expandedHero === 'time'}
            onToggleExpand={toggleHero('time')}
            range={range}
            onRangeChange={setRange}
          />
        </div>
      </div>

      {showTopMovers && (
        <TopMovers
          values={filteredValues}
          historicalPrices={historicalData?.prices ?? []}
          historicalFxRates={historicalData?.fxRates ?? []}
          range={range}
        />
      )}

      {showChartRow && (
        <div className="flex flex-col gap-4 md:flex-row">
          {classFilter === 'ALL' && (
            <div
              style={flexStyle('assetClass', expandedChart)}
              className="min-w-0 transition-all duration-300"
            >
              <BreakdownDonut
                title="Anlageklassen"
                data={assetClassBreakdown(values)}
                expanded={expandedChart === 'assetClass'}
                onToggleExpand={toggle('assetClass')}
                {...drillProps('assetClass')}
              />
            </div>
          )}
          {showSector && (
            <div
              style={flexStyle('sector', expandedChart)}
              className="min-w-0 transition-all duration-300"
            >
              <BreakdownDonut
                title="Sektoren (inkl. ETF-Durchschau)"
                data={sectorBreakdown(filteredValues, etfComposition ?? [])}
                expanded={expandedChart === 'sector'}
                onToggleExpand={toggle('sector')}
                {...drillProps('sector')}
              />
            </div>
          )}
          {showRegion && (
            <div
              style={flexStyle('region', expandedChart)}
              className="min-w-0 transition-all duration-300"
            >
              <BreakdownDonut
                title="Regionen (inkl. ETF-Durchschau)"
                data={regionBreakdown(filteredValues, etfComposition ?? [], regionGrouping)}
                expanded={expandedChart === 'region'}
                onToggleExpand={toggle('region')}
                {...drillProps('region')}
                headerExtra={
                  <button
                    type="button"
                    onClick={() =>
                      setRegionGrouping((g) => (g === 'country' ? 'continent' : 'country'))
                    }
                    className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs whitespace-nowrap text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {regionGrouping === 'country' ? 'Nach Kontinent' : 'Nach Land'}
                  </button>
                }
              />
            </div>
          )}
        </div>
      )}

      {showCashTypes && (
        <div className="flex flex-col gap-4 md:flex-row">
          <div
            style={expandedChart === 'cashType' ? { flex: '1 1 0%' } : { flex: '0 0 33%' }}
            className="min-w-0 transition-all duration-300"
          >
            <BreakdownDonut
              title="Kontoarten"
              data={cashTypeBreakdown(filteredValues)}
              expanded={expandedChart === 'cashType'}
              onToggleExpand={toggle('cashType')}
              {...drillProps('cashType')}
            />
          </div>
        </div>
      )}

      <HoldingsList values={filteredValues} />
    </div>
  )
}
