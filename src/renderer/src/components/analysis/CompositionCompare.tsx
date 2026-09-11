import { useState } from 'react'
import {
  BENCHMARK_UNIVERSES,
  EQUITY_COMPONENTS,
  type BenchmarkComponent,
  type BenchmarkComponentDef,
  type BenchmarkUniverse,
  type BenchmarkWeights,
  type ComparableModel
} from '@shared/benchmarkCalc'
import { compareAllocation } from '@shared/allocationCalc'
import { displayClass } from '@shared/displayClass'
import type { PositionValue } from '@shared/valueCalc'
import type { EtfCompositionEntry } from '@shared/types'
import { regionBreakdown, sectorBreakdown, type RegionGrouping } from '../../lib/selectors'
import { compareShares, compositionShares, slicesToShares } from '../../lib/compositionCompare'
import { countryToRegion } from '../../lib/regionMap'
import { AllocationCompare } from './AllocationCompare'
import { ShareCompareTable } from './ShareCompareTable'

interface CompositionCompareProps {
  /** Alle bewerteten Positionen - die Auswahl der Töpfe trifft compareAllocation. */
  values: PositionValue[]
  compositions: EtfCompositionEntry[]
  /** Die im Vergleich ausgewählten Modelle. */
  models: ComparableModel[]
  universe: BenchmarkUniverse
}

const toggleGroupClass = 'flex gap-1 rounded-md bg-slate-200 p-1 dark:bg-slate-800'

function toggleClass(active: boolean): string {
  return `rounded px-2.5 py-1 text-xs font-medium ${
    active
      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
  }`
}

function Card({
  title,
  subtitle,
  action,
  children
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

/**
 * Der Aktienbaustein, auf dem ein Modell aufsetzt, samt seinem gesamten Aktiengewicht.
 *
 * Bewusst nicht fest der Aktienbaustein des Universums: der norwegische Staatsfonds bildet den
 * FTSE Global All Cap ab, 60/40 dagegen den S&P 500 bzw. den MSCI World. Für Länder und Branchen
 * muss der Index herangezogen werden, den DIESES Modell benutzt - sonst stünden sich zwei Seiten
 * gegenüber, die nichts miteinander zu tun haben. Hält ein eigenes Modell beide Aktienbausteine,
 * gibt der schwerere den Ausschlag.
 */
function modelEquity(
  weights: BenchmarkWeights,
  universe: BenchmarkUniverse
): { def: BenchmarkComponentDef; weight: number } {
  const defs = BENCHMARK_UNIVERSES[universe]
  let heaviest: BenchmarkComponent = EQUITY_COMPONENTS[0]
  let total = 0
  for (const component of EQUITY_COMPONENTS) {
    const weight = weights[component] ?? 0
    total += weight
    if (weight > (weights[heaviest] ?? 0)) heaviest = component
  }
  return { def: defs[heaviest], weight: total }
}

/**
 * Die Zusammensetzung des eigenen Depots gegen die eines Modells.
 *
 * Zwei Ebenen: oben die groben Anlageklassen (dort hat das Modell eigene Sollgewichte), darunter
 * der Aktienanteil im Detail. Für die zweite Ebene gibt das Modell selbst nichts her - dort steht
 * die Aufteilung des Index, auf den es sich stützt (S&P 500 bzw. MSCI World). Beide Seiten sind
 * jeweils auf 100 % ihres eigenen Aktienanteils normiert, verglichen wird also die Form der
 * Aufteilung, nicht die Größe.
 */
export function CompositionCompare({
  values,
  compositions,
  models,
  universe
}: CompositionCompareProps): React.JSX.Element {
  const [modelKey, setModelKey] = useState<string>(models[0]?.key ?? '')
  const [includeCash, setIncludeCash] = useState(false)
  const [grouping, setGrouping] = useState<RegionGrouping>('country')

  // Fällt das gewählte Modell aus der Auswahl (abgewählt oder gelöscht), rückt das erste nach.
  const model = models.find((m) => m.key === modelKey) ?? models[0]

  if (!model) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Kein Modell ausgewählt – oben mindestens eines anhaken, dann erscheint hier der Vergleich.
      </p>
    )
  }

  const comparison = compareAllocation(values, model.weights, includeCash)
  const { def: equityDef, weight: equityWeight } = modelEquity(model.weights, universe)
  const modelHoldsEquity = equityWeight > 0

  const equityValues = values.filter((v) => displayClass(v.position) === 'STOCK_ETF')
  const groupLabel = grouping === 'continent' ? countryToRegion : undefined

  // Ohne die Aufteilung des Index fehlt die Modellseite - dann ist die Tabelle ein einseitiger
  // Bericht über das eigene Depot und kein Vergleich. In dem Fall bleibt sie leer und erklärt sich.
  const modelSectors = compositionShares(compositions, equityDef.identifier, 'SECTOR')
  const modelRegions = compositionShares(compositions, equityDef.identifier, 'COUNTRY', groupLabel)

  const sectorRows =
    modelSectors.length === 0
      ? []
      : compareShares(slicesToShares(sectorBreakdown(equityValues, compositions)), modelSectors)
  const regionRows =
    modelRegions.length === 0
      ? []
      : compareShares(
          slicesToShares(regionBreakdown(equityValues, compositions, grouping)),
          modelRegions
        )

  const indexHint = `Für ${equityDef.label} liegt noch keine Aufteilung vor – „Daten aktualisieren“ holt sie nach.`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className={toggleGroupClass}>
          {models.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setModelKey(m.key)}
              className={toggleClass(m.key === model.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={includeCash}
            onChange={(e) => setIncludeCash(e.target.checked)}
          />
          Cash &amp; Sonstiges mitzählen
        </label>
      </div>

      <Card
        title="Anlageklassen"
        subtitle={
          includeCash
            ? 'Dein gesamtes Vermögen gegen die Sollgewichte des Modells. Für Cash sieht kein Modell ein Gewicht vor – der Topf erscheint deshalb als Übergewicht.'
            : 'Nur Angelegtes: Girokonto, Bargeld und Immobilien bleiben außen vor, weil die Modelle reine Wertpapier-Allokationen sind.'
        }
      >
        <AllocationCompare comparison={comparison} modelLabel={model.label} />
      </Card>

      {modelHoldsEquity ? (
        <>
          <Card
            title="Länder im Aktienanteil"
            subtitle={`Dein Aktien- und ETF-Anteil gegen ${equityDef.label}, beide Seiten auf 100 % normiert.`}
            action={
              <div className={toggleGroupClass}>
                <button
                  type="button"
                  onClick={() => setGrouping('country')}
                  className={toggleClass(grouping === 'country')}
                >
                  Länder
                </button>
                <button
                  type="button"
                  onClick={() => setGrouping('continent')}
                  className={toggleClass(grouping === 'continent')}
                >
                  Regionen
                </button>
              </div>
            }
          >
            <ShareCompareTable
              rows={regionRows}
              modelLabel={equityDef.label}
              emptyHint={indexHint}
            />
          </Card>

          <Card
            title="Branchen im Aktienanteil"
            subtitle={`Dein Aktien- und ETF-Anteil gegen ${equityDef.label}, beide Seiten auf 100 % normiert.`}
          >
            <ShareCompareTable
              rows={sectorRows}
              modelLabel={equityDef.label}
              emptyHint={indexHint}
            />
          </Card>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {model.label} hält keine Aktien – Länder und Branchen gibt es dort nicht zu vergleichen.
        </p>
      )}
    </div>
  )
}
