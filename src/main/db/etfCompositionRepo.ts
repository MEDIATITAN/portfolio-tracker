import { getDb } from './index'
import type { EtfCompositionEntry, EtfCompositionKind } from '../../shared/types'

interface Row {
  identifier: string
  kind: EtfCompositionKind
  label: string
  weight: number
  fetched_at: string
}

function rowTo(row: Row): EtfCompositionEntry {
  return { identifier: row.identifier, kind: row.kind, label: row.label, weight: row.weight, fetchedAt: row.fetched_at }
}

export function listAll(): EtfCompositionEntry[] {
  const rows = getDb().prepare('SELECT * FROM etf_composition').all() as unknown as Row[]
  return rows.map(rowTo)
}

/** Zeitpunkt des letzten Abrufs für einen Fonds, oder null wenn noch nie abgerufen. */
export function lastFetchedAt(identifier: string): string | null {
  const row = getDb()
    .prepare('SELECT MAX(fetched_at) AS f FROM etf_composition WHERE identifier = ?')
    .get(identifier) as unknown as { f: string | null } | undefined
  return row?.f ?? null
}

/** Ersetzt die komplette Zusammensetzung eines Fonds (Gewichte ändern sich, alte Einträge müssen weg). */
export function replaceComposition(identifier: string, entries: Omit<EtfCompositionEntry, 'identifier'>[]): void {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM etf_composition WHERE identifier = ?').run(identifier)
    const stmt = db.prepare(
      'INSERT INTO etf_composition (identifier, kind, label, weight, fetched_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const e of entries) stmt.run(identifier, e.kind, e.label, e.weight, e.fetchedAt)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
