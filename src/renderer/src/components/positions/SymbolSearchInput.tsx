import { useEffect, useState } from 'react'
import type { AssetClass, SymbolSearchResult } from '@shared/types'
import { useSymbolSearch } from '../../lib/queries'
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
          {results!.map((r) => (
            <li key={r.identifier}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(r)
                  setFocused(false)
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {r.symbol}{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">– {r.name}</span>
                </span>
                {(r.exchange || r.sector) && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {[r.exchange, r.sector].filter(Boolean).join(' · ')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
