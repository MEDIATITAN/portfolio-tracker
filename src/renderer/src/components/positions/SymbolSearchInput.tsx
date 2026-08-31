import { useEffect, useState } from 'react'
import type { AssetClass, SymbolSearchResult } from '@shared/types'
import { useSearchQuotes, useSymbolSearch } from '../../lib/queries'
import { formatMoney } from '../../lib/format'
import { inputClass } from './formStyles'

interface SymbolSearchInputProps {
  assetClass: AssetClass
  value: string
  onChangeText: (text: string) => void
  onSelect: (result: SymbolSearchResult) => void
  placeholder?: string
}

export function SymbolSearchInput({
  assetClass,
  value,
  onChangeText,
  onSelect,
  placeholder
}: SymbolSearchInputProps): React.JSX.Element {
  const [focused, setFocused] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(value), 300)
    return () => clearTimeout(timer)
  }, [value])

  const { data: results, isFetching } = useSymbolSearch(assetClass, debouncedQuery)
  const showDropdown = focused && debouncedQuery.trim().length >= 2 && (results?.length ?? 0) > 0

  // Kurse werden erst nach den Treffern geladen - die Liste erscheint dadurch sofort, die Kurse
  // erscheinen kurz darauf. Nur abfragen, solange die Liste offen ist.
  const { data: quotes } = useSearchQuotes(assetClass, showDropdown ? (results ?? []).map((r) => r.identifier) : [])
  const quoteFor = (identifier: string): { price: number; currency: string } | undefined =>
    quotes?.find((q) => q.identifier === identifier)

  return (
    <div className="relative">
      <input
        className={`${inputClass} w-full`}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isFetching && <span className="absolute top-2 right-2 text-xs text-slate-400 dark:text-slate-500">…</span>}
      {showDropdown && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800">
          {results!.map((r) => {
            const quote = quoteFor(r.identifier)
            return (
              <li key={r.identifier}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(r)
                    setFocused(false)
                  }}
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {r.symbol}{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">– {r.name}</span>
                    </span>
                    {(r.exchange || r.sector) && (
                      <span className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {[r.exchange, r.sector].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {quote && (
                    <span className="shrink-0 pt-0.5 text-xs font-medium whitespace-nowrap text-slate-700 dark:text-slate-300">
                      {formatMoney(quote.price, quote.currency)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
