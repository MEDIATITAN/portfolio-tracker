interface LastUpdatedBadgeProps {
  updatedCount: number | null
  /** Die Kennungen, für die kein Kurs kam - benannt statt nur gezählt: eine bloße Zahl sagt
   *  nicht, WELCHES Wertpapier klemmt, und genau das ist die einzige verwertbare Information. */
  failedIdentifiers: string[]
}

export function LastUpdatedBadge({
  updatedCount,
  failedIdentifiers
}: LastUpdatedBadgeProps): React.JSX.Element | null {
  if (updatedCount === null) return null
  return (
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {updatedCount} Kurs{updatedCount === 1 ? '' : 'e'} aktualisiert
      {failedIdentifiers.length > 0 && (
        <span className="text-amber-600 dark:text-amber-500">
          {' '}
          · kein Kurs für {failedIdentifiers.join(', ')}
        </span>
      )}
    </p>
  )
}
