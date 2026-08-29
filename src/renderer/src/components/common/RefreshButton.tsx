interface RefreshButtonProps {
  onRefresh: () => void
  isRefreshing: boolean
}

export function RefreshButton({ onRefresh, isRefreshing }: RefreshButtonProps): React.JSX.Element {
  return (
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {isRefreshing ? 'Aktualisiere…' : 'Kurse aktualisieren'}
    </button>
  )
}
