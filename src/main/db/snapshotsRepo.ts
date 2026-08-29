import { getDb } from './index'
import type { AssetClass, SnapshotItem, ValueSnapshot } from '../../shared/types'

export function listSnapshots(): ValueSnapshot[] {
  const db = getDb()
  const snapshotRows = db.prepare('SELECT * FROM value_snapshots ORDER BY taken_at ASC').all() as unknown as {
    id: number
    taken_at: string
    total_value_eur: number
  }[]
  const itemStmt = db.prepare('SELECT asset_class, value_eur FROM snapshot_items WHERE snapshot_id = ?')
  return snapshotRows.map((row) => ({
    id: row.id,
    takenAt: row.taken_at,
    totalValueEur: row.total_value_eur,
    items: (
      itemStmt.all(row.id) as unknown as { asset_class: AssetClass; value_eur: number }[]
    ).map((item) => ({ assetClass: item.asset_class, valueEur: item.value_eur }))
  }))
}

export function deleteAllSnapshots(): void {
  const db = getDb()
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM snapshot_items').run()
    db.prepare('DELETE FROM value_snapshots').run()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function createSnapshot(takenAt: string, totalValueEur: number, items: SnapshotItem[]): number {
  const db = getDb()
  db.exec('BEGIN')
  try {
    const result = db
      .prepare('INSERT INTO value_snapshots (taken_at, total_value_eur) VALUES (?, ?)')
      .run(takenAt, totalValueEur)
    const snapshotId = Number(result.lastInsertRowid)
    const insertItem = db.prepare(
      'INSERT INTO snapshot_items (snapshot_id, asset_class, value_eur) VALUES (?, ?, ?)'
    )
    for (const item of items) {
      insertItem.run(snapshotId, item.assetClass, item.valueEur)
    }
    db.exec('COMMIT')
    return snapshotId
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}
