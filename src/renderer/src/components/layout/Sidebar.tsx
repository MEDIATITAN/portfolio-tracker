import { useState } from 'react'
import type { ClassFilter, Page } from '../../lib/navigation'
import { ASSET_CLASS_LABELS } from '../../lib/format'
import { DISPLAY_CLASS_ORDER } from '@shared/displayClass'
import { useTheme } from '../../lib/ThemeContext'

interface SidebarProps {
  page: Page
  classFilter: ClassFilter
  onNavigateDashboard: (filter: ClassFilter) => void
  onNavigatePositions: () => void
  onNavigatePnl: () => void
  onNavigateTransactions: () => void
}

const ASSET_CLASSES = DISPLAY_CLASS_ORDER

function DashboardIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-4 w-4 shrink-0"
    >
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v7l5 3" />
    </svg>
  )
}

function ListIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 6h12M4 10h12M4 14h8" />
    </svg>
  )
}

function PnlIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M3 13l4-4 3 3 6-6" />
      <path d="M12 6h4v4" />
    </svg>
  )
}

function HistoryIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 4v4h4" />
      <path d="M4.5 12a6.5 6.5 0 1 0 1.6-5.7L4 8.5" />
      <path d="M10 7v4l3 2" />
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  )
}

export function Sidebar({
  page,
  classFilter,
  onNavigateDashboard,
  onNavigatePositions,
  onNavigatePnl,
  onNavigateTransactions
}: SidebarProps): React.JSX.Element {
  const [assetClassesOpen, setAssetClassesOpen] = useState(true)
  const { theme, toggleTheme } = useTheme()
  const dashboardActive = page === 'dashboard' && classFilter === 'ALL'

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-slate-900 text-slate-300">
      <div className="px-4 py-4">
        <span className="text-sm font-semibold text-white">Portfolio-Tracker</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <div
          className={`flex items-center gap-1 rounded-md text-sm font-medium ${
            dashboardActive ? 'bg-blue-500/15 text-blue-400' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={() => onNavigateDashboard('ALL')}
            className="flex flex-1 items-center gap-2 px-2 py-2 text-left"
          >
            <DashboardIcon />
            <span>Übersicht</span>
          </button>
          <button
            type="button"
            onClick={() => setAssetClassesOpen((v) => !v)}
            aria-label={assetClassesOpen ? 'Anlageklassen einklappen' : 'Anlageklassen aufklappen'}
            className="mr-1 rounded p-1 hover:bg-slate-700"
          >
            <ChevronIcon expanded={assetClassesOpen} />
          </button>
        </div>
        {assetClassesOpen && (
          <div className="mt-0.5 mb-1 ml-3 flex flex-col gap-0.5 border-l border-slate-700 pl-3">
            {ASSET_CLASSES.map((ac) => {
              const active = page === 'dashboard' && classFilter === ac
              return (
                <button
                  key={ac}
                  type="button"
                  onClick={() => onNavigateDashboard(ac)}
                  className={`rounded-md px-2 py-1.5 text-left text-xs ${
                    active
                      ? 'bg-blue-500/15 font-medium text-blue-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {ASSET_CLASS_LABELS[ac]}
                </button>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={onNavigatePositions}
          className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            page === 'positions'
              ? 'bg-blue-500/15 text-blue-400'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <ListIcon />
          <span>Positionen</span>
        </button>

        <button
          type="button"
          onClick={onNavigatePnl}
          className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            page === 'pnl' ? 'bg-blue-500/15 text-blue-400' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <PnlIcon />
          <span>Gewinn &amp; Verlust</span>
        </button>

        <button
          type="button"
          onClick={onNavigateTransactions}
          className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
            page === 'transactions'
              ? 'bg-blue-500/15 text-blue-400'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <HistoryIcon />
          <span>Verlauf</span>
        </button>
      </nav>
      <div className="border-t border-slate-800 px-2 py-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}</span>
        </button>
      </div>
    </aside>
  )
}
