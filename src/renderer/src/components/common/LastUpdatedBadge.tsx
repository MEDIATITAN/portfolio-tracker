interface LastUpdatedBadgeProps {
  updatedCount: number | null
  failedCount: number
}

export function LastUpdatedBadge({ updatedCount, failedCount }: LastUpdatedBadgeProps): React.JSX.Element | null {
  if (updatedCount === null) return null
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {updatedCount} Kurs{updatedCount === 1 ? '' : 'e'} aktualisiert
      {failedCount > 0 && <span className="text-amber-600 dark:text-amber-500"> · {failedCount} fehlgeschlagen</span>}
    </p>
  )
}
