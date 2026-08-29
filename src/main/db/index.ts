import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'
import { SCHEMA_SQL, SEED_SETTINGS } from './schema'

let db: DatabaseSync | null = null

/** Fügt eine Spalte hinzu, falls eine bereits bestehende Datenbank sie noch nicht kennt (leichte Migration ohne Framework). */
function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function getDb(): DatabaseSync {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'portfolio.db')
    const database = new DatabaseSync(dbPath)
    database.exec('PRAGMA journal_mode = WAL')
    database.exec('PRAGMA foreign_keys = ON')
    database.exec(SCHEMA_SQL)
    ensureColumn(database, 'positions', 'quantity_unit', 'TEXT')
    ensureColumn(database, 'positions', 'purchase_date', 'TEXT')

    const seedStmt = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    for (const [key, value] of Object.entries(SEED_SETTINGS)) {
      seedStmt.run(key, value)
    }

    db = database
  }
  return db
}
