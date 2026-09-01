import { Fragment, useState } from 'react'
import type {
  AssetClass,
  FxRate,
  PriceCacheEntry,
  Position,
  TransactionWithPosition
} from '@shared/types'
import { computeAllPositionValues, findFxRate } from '@shared/valueCalc'
import {
  ASSET_CLASS_LABELS,
  CASH_SUB_TYPE_LABELS,
  formatDate,
  formatEur,
  formatMoney,
  formatNumber
} from '../../lib/format'
import { useTransactions } from '../../lib/queries'

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

/** Die Buchungen einer Position, chronologisch - die Reihenfolge, in der auch FIFO rechnet. */
function TransactionDetails({
  transactions
}: {
  transactions: TransactionWithPosition[]
}): React.JSX.Element {
  const buys = transactions.filter((t) => t.type === 'BUY')
  const buyQuantity = buys.reduce((sum, t) => sum + t.quantity, 0)
  const buyCost = buys.reduce((sum, t) => sum + t.quantity * t.price, 0)

  return (
    <div className="border-l-2 border-slate-300 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500 dark:text-slate-400">
          <tr>
            <th className="pb-1 font-medium">Datum</th>
            <th className="pb-1 font-medium">Art</th>
            <th className="pb-1 text-right font-medium">Menge</th>
            <th className="pb-1 text-right font-medium">Kurs</th>
            <th className="pb-1 text-right font-medium">Summe</th>
            <th className="pb-1 pl-4 font-medium">Herkunft</th>
          </tr>
        </thead>
        <tbody className="text-slate-700 dark:text-slate-300">
          {transactions.map((t) => (
            <tr key={t.id} className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-1">{formatDate(t.date)}</td>
              <td className="py-1">
                <span
                  className={
                    t.type === 'BUY'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }
                >
                  {t.type === 'BUY' ? 'Kauf' : 'Verkauf'}
                </span>
              </td>
              <td className="py-1 text-right">{formatNumber(t.quantity)}</td>
              <td className="py-1 text-right">{formatMoney(t.price, t.currency)}</td>
              <td className="py-1 text-right font-medium">
                {formatMoney(t.quantity * t.price, t.currency)}
              </td>
              <td className="py-1 pl-4 text-slate-400 dark:text-slate-500">{t.broker ?? '–'}</td>
            </tr>
          ))}
        </tbody>
        {buys.length > 1 && (
          <tfoot className="text-slate-600 dark:text-slate-300">
            {/* Der Durchschnitt bezieht sich bewusst nur auf die KÄUFE: er beantwortet "zu welchem
                Schnitt habe ich gekauft", nicht den nach Verkäufen verbleibenden Einstand (der
                steht als Kaufpreis in der Hauptzeile und wird nach FIFO gerechnet). */}
            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
              <td className="pt-1 font-medium" colSpan={2}>
                Ø aus {buys.length} Käufen
              </td>
              <td className="pt-1 text-right font-medium">{formatNumber(buyQuantity)}</td>
              <td className="pt-1 text-right font-medium">
                {formatMoney(buyCost / buyQuantity, buys[0].currency)}
              </td>
              <td className="pt-1 text-right font-medium">
                {formatMoney(buyCost, buys[0].currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

export function PositionsTable({
  positions,
  priceCache,
  fxRates,
  onEdit,
  onDelete
}: PositionsTableProps): React.JSX.Element {
  const { data: transactions } = useTransactions()
  const [expandedId, setExpandedId] = useState<number | null>(null)

  if (positions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Noch keine Positionen erfasst. Füge oben deine erste Position hinzu.
      </p>
    )
  }

  const values = computeAllPositionValues(positions, priceCache, fxRates)

  // Buchungen je Position, chronologisch - dieselbe Reihenfolge, in der auch FIFO rechnet.
  const byPosition = new Map<number, TransactionWithPosition[]>()
  for (const t of transactions ?? []) {
    const list = byPosition.get(t.positionId)
    if (list) list.push(t)
    else byPosition.set(t.positionId, [t])
  }
  for (const list of byPosition.values()) list.sort((a, b) => a.date.localeCompare(b.date))

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
                {group.map(
                  ({
                    position,
                    valueEur,
                    priceEur,
                    avgCostBasisEur,
                    gainLossEur,
                    stale,
                    fetchError
                  }) => {
                    const unitSuffix = position.quantityUnit
                      ? QUANTITY_UNIT_SUFFIX[position.quantityUnit]
                      : null
                    // Cash in einer anderen Währung als Euro - dann sind Betrag und Wechselkurs
                    // eine eigene Information, nicht nur der umgerechnete Eurowert.
                    const foreignCash =
                      position.assetClass === 'CASH_OTHER' && position.currency !== 'EUR'
                    const fxRate = foreignCash
                      ? findFxRate(fxRates, position.currency, 'EUR')
                      : null
                    const positionTransactions = byPosition.get(position.id) ?? []
                    const expandable = positionTransactions.length > 0
                    const expanded = expandedId === position.id
                    const buyCount = positionTransactions.filter((t) => t.type === 'BUY').length

                    return (
                      <Fragment key={position.id}>
                        <tr
                          onClick={() => expandable && setExpandedId(expanded ? null : position.id)}
                          className={`border-t border-slate-100 text-slate-900 dark:border-slate-800 dark:text-slate-100 ${
                            expandable
                              ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              : ''
                          } ${expanded ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}
                        >
                          <td className="px-3 py-2">
                            {expandable && (
                              // Dreieck statt Text: zeigt Aufklappbarkeit an, ohne die Spalte zu verbreitern.
                              <span className="mr-1.5 inline-block w-2 text-slate-400 dark:text-slate-500">
                                {expanded ? '▾' : '▸'}
                              </span>
                            )}
                            {position.name}
                            {position.subType && (
                              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                                ({CASH_SUB_TYPE_LABELS[position.subType]})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {assetClass === 'CASH_OTHER'
                              ? // Bei Fremdwährung den GEHALTENEN Betrag zeigen - sonst sähe man nur
                                // den Eurowert und wüsste nicht, wie viel Dollar oder Franken
                                // tatsächlich auf dem Konto liegen.
                                foreignCash
                                ? formatMoney(position.manualValue, position.currency)
                                : '–'
                              : `${formatNumber(position.quantity)}${unitSuffix ? ` ${unitSuffix}` : ''}`}
                          </td>
                          <td className="px-3 py-2">
                            {assetClass === 'CASH_OTHER' ? (
                              foreignCash ? (
                                // Statt eines Börsenkurses der angewandte Wechselkurs.
                                <span className="text-slate-500 dark:text-slate-400">
                                  {fxRate !== null
                                    ? `${formatNumber(fxRate)} €/${position.currency}`
                                    : 'kein Wechselkurs'}
                                </span>
                              ) : (
                                '–'
                              )
                            ) : priceEur !== null ? (
                              <span
                                className={stale ? 'text-amber-600 dark:text-amber-500' : ''}
                                title={fetchError ?? undefined}
                              >
                                {formatEur(priceEur)}
                                {assetClass === 'COMMODITY' ? ' /oz' : ''}
                                {stale ? ' *' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">
                                noch kein Kurs
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {formatEur(avgCostBasisEur)}
                            {buyCount > 1 ? (
                              <span className="block text-xs text-slate-400 dark:text-slate-500">
                                Ø aus {buyCount} Käufen
                              </span>
                            ) : (
                              position.purchaseDate && (
                                <span className="block text-xs text-slate-400 dark:text-slate-500">
                                  seit {formatDate(position.purchaseDate)}
                                </span>
                              )
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {valueEur !== null ? (
                              formatEur(valueEur)
                            ) : (
                              <span className="font-normal text-slate-400 dark:text-slate-500">
                                noch kein Kurs
                              </span>
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 ${gainLossEur !== null && gainLossEur < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                          >
                            {gainLossEur !== null ? formatEur(gainLossEur) : '–'}
                          </td>
                          {/* stopPropagation: sonst klappt ein Klick auf Bearbeiten/Löschen zusätzlich
                          die Buchungsliste auf oder zu. */}
                          <td
                            className="px-3 py-2 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
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
                        {expanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <TransactionDetails transactions={positionTransactions} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  }
                )}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
