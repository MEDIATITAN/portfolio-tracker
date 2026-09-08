import type { HistoricalFxEntry, HistoricalPriceEntry } from '@shared/types'
import type { PositionValue } from '@shared/valueCalc'
import { formatEur, formatPercent } from '../../lib/format'
import { buildPriceEurLookup } from '../../lib/historicalSeries'
import { RANGE_SUBTITLES, rangeStart, type TimeRange } from '../../lib/timeRange'

interface Mover {
  name: string
  percent: number
  valueEur: number | null
}

interface TopMoversProps {
  values: PositionValue[]
  historicalPrices: HistoricalPriceEntry[]
  historicalFxRates: HistoricalFxEntry[]
  range: TimeRange
}

const TOP_COUNT = 3

function toDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Wertentwicklung je Position im gewählten Zeitraum.
 *
 * Gemessen wird der KURS je Einheit, nicht der Positionswert. Sonst stünde ein Papier, das im
 * Zeitraum nachgekauft wurde, als riesiger "Gewinner" da - obwohl der Zuwachs nur aus dem Zukauf
 * stammt und nicht aus einer Kursbewegung.
 *
 * Für "Alle" gibt es keinen Zeitraumanfang; dort zählt die echte Rendite seit dem Kauf, also der
 * Vergleich mit dem tatsächlich bezahlten Einstandspreis. Das ist dieselbe Zahl, die auch in der
 * Positionsliste steht.
 */
function computeMovers(
  values: PositionValue[],
  historicalPrices: HistoricalPriceEntry[],
  historicalFxRates: HistoricalFxEntry[],
  range: TimeRange
): Mover[] {
  const priceEurOn = buildPriceEurLookup(historicalPrices, historicalFxRates)
  const startDay = range === 'ALL' ? null : toDayKey(rangeStart(range))
  const movers: Mover[] = []

  for (const v of values) {
    const { position } = v
    // Cash hat keinen Kurs, der sich bewegen könnte.
    if (position.assetClass === 'CASH_OTHER' || !position.identifier) continue
    // Vollständig verkauft: das Papier hat weiter einen Kurs, aber es gehört nicht mehr zum
    // Depot - als "Gewinner" hätte es dort nichts zu suchen. Die Toleranz statt eines
    // Vergleichs auf exakt 0 fängt Rundungsreste der FIFO-Berechnung ab.
    if (position.quantity <= 1e-9) continue
    if (v.priceEur === null) continue

    if (startDay === null) {
      // Bewusst über den ausgewiesenen Gewinn statt über Kurs geteilt durch Einstandspreis:
      // bei Rohstoffen sind das VERSCHIEDENE Einheiten. Gold notiert je Feinunze, erfasst ist
      // es in Gramm - der Vergleich lieferte für Gold +3131 % statt der tatsächlichen +3,9 %,
      // weil das Verhältnis Unze zu Gramm mit in die Zahl rutschte.
      if (v.gainLossEur === null || v.avgCostBasisEur === null) continue
      const investedEur = v.avgCostBasisEur * position.quantity
      if (investedEur <= 0) continue
      movers.push({
        name: position.name,
        percent: (v.gainLossEur / investedEur) * 100,
        valueEur: v.valueEur
      })
      continue
    }

    const before = priceEurOn(position.identifier, startDay)
    if (before === null || before <= 0) continue
    movers.push({
      name: position.name,
      percent: (v.priceEur / before - 1) * 100,
      valueEur: v.valueEur
    })
  }

  return movers.sort((a, b) => b.percent - a.percent)
}

function MoverRow({ mover }: { mover: Mover }): React.JSX.Element {
  const positive = mover.percent >= 0
  return (
    <li className="flex items-baseline justify-between gap-3 py-1">
      <span
        className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300"
        title={mover.name}
      >
        {mover.name}
      </span>
      {mover.valueEur !== null && (
        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
          {formatEur(mover.valueEur)}
        </span>
      )}
      <span
        className={`shrink-0 font-medium tabular-nums ${
          positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        {formatPercent(mover.percent)}
      </span>
    </li>
  )
}

function MoverList({ title, movers }: { title: string; movers: Mover[] }): React.JSX.Element {
  return (
    <div className="min-w-0 flex-1">
      <h4 className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {title}
      </h4>
      {movers.length === 0 ? (
        <p className="py-1 text-sm text-slate-400 dark:text-slate-500">keine Daten</p>
      ) : (
        <ul className="text-sm">
          {movers.map((m) => (
            <MoverRow key={m.name} mover={m} />
          ))}
        </ul>
      )}
    </div>
  )
}

export function TopMovers({
  values,
  historicalPrices,
  historicalFxRates,
  range
}: TopMoversProps): React.JSX.Element | null {
  const movers = computeMovers(values, historicalPrices, historicalFxRates, range)
  if (movers.length === 0) return null

  const winners = movers.slice(0, TOP_COUNT)
  // Von hinten nehmen und umdrehen, damit der größte Verlust oben steht. Bei wenigen Positionen
  // dürfen sich beide Listen nicht überschneiden - sonst stünde dasselbe Papier zweimal da.
  const losers = movers
    .slice(Math.max(winners.length, movers.length - TOP_COUNT))
    .reverse()
    .filter((m) => m.percent < 0)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          Gewinner &amp; Verlierer
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">{RANGE_SUBTITLES[range]}</span>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
        <MoverList title="Top 3" movers={winners} />
        <MoverList title="Flop 3" movers={losers} />
      </div>
    </div>
  )
}
