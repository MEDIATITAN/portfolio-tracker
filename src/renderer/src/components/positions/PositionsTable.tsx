import type { AssetClass, FxRate, PriceCacheEntry, Position } from '@shared/types'
import { computeAllPositionValues } from '@shared/valueCalc'
import { ASSET_CLASS_LABELS, CASH_SUB_TYPE_LABELS, formatDate, formatEur, formatNumber } from '../../lib/format'

interface PositionsTableProps {
  positions: Position[]
  priceCache: PriceCacheEntry[]
  fxRates: FxRate[]
  onEdit: (position: Position) => void
  onDelete: (id: number) => void
}

const GROUP_ORDER: AssetClass[] = ['STOCK_ETF', 'CRYPTO', 'COMMODITY', 'CASH_OTHER']

const QUANTITY_UNIT_SUFFIX: Record<string, string> = {
  GRAM: 'g',
  KG: 'kg',
  TROY_OUNCE: 'oz',
  POUND: 'lb'
}

export function PositionsTable({
  positions,
  priceCache,
  fxRates,
  onEdit,
  onDelete
}: PositionsTableProps): React.JSX.Element {
  if (positions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Noch keine Positionen erfasst. Füge oben deine erste Position hinzu.
      </p>
    )
  }

  const values = computeAllPositionValues(positions, priceCache, fxRates)

  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((assetClass) => {
        const group = values.filter((v) => v.position.assetClass === assetClass)
        if (group.length === 0) return null
        return (
          <section key={assetClass}>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              {ASSET_CLASS_LABELS[assetClass]}
            </h2>
            <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-900">
              <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Menge</th>
                  <th className="px-3 py-2 font-medium">Kurs (EUR)</th>
                  <th className="px-3 py-2 font-medium">Kaufpreis (EUR)</th>
                  <th className="px-3 py-2 font-medium">Wert (EUR)</th>
                  <th className="px-3 py-2 font-medium">Gewinn/Verlust</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {group.map(({ position, valueEur, priceEur, avgCostBasisEur, gainLossEur, stale, fetchError }) => {
                  const unitSuffix = position.quantityUnit ? QUANTITY_UNIT_SUFFIX[position.quantityUnit] : null

                  return (
                    <tr key={position.id} className="border-t border-slate-100 text-slate-900 dark:border-slate-800 dark:text-slate-100">
                      <td className="px-3 py-2">
                        {position.name}
                        {position.subType && (
                          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                            ({CASH_SUB_TYPE_LABELS[position.subType]})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {assetClass === 'CASH_OTHER'
                          ? '–'
                          : `${formatNumber(position.quantity)}${unitSuffix ? ` ${unitSuffix}` : ''}`}
                      </td>
                      <td className="px-3 py-2">
                        {assetClass === 'CASH_OTHER' ? (
                          '–'
                        ) : priceEur !== null ? (
                          <span className={stale ? 'text-amber-600 dark:text-amber-500' : ''} title={fetchError ?? undefined}>
                            {formatEur(priceEur)}
                            {assetClass === 'COMMODITY' ? ' /oz' : ''}
                            {stale ? ' *' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">noch kein Kurs</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {formatEur(avgCostBasisEur)}
                        {position.purchaseDate && (
                          <span className="block text-xs text-slate-400 dark:text-slate-500">
                            seit {formatDate(position.purchaseDate)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {valueEur !== null ? (
                          formatEur(valueEur)
                        ) : (
                          <span className="font-normal text-slate-400 dark:text-slate-500">noch kein Kurs</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 ${gainLossEur !== null && gainLossEur < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                      >
                        {gainLossEur !== null ? formatEur(gainLossEur) : '–'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => onEdit(position)}
                          className="mr-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => onDelete(position.id)}
                          className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
