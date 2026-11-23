import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'
import { SCHEMA_SQL, SEED_SETTINGS } from './schema'
import { activeProfileFile } from './profileRegistry'

let db: DatabaseSync | null = null

/** Fügt eine Spalte hinzu, falls eine bereits bestehende Datenbank sie noch nicht kennt (leichte Migration ohne Framework). */
function ensureColumn(
  database: DatabaseSync,
  table: string,
  column: string,
  definition: string
): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as {
    name: string
  }[]
  if (!columns.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function getDb(): DatabaseSync {
  if (!db) {
    const dbPath = join(app.getPath('userData'), activeProfileFile())
    const database = new DatabaseSync(dbPath)
    database.exec('PRAGMA journal_mode = WAL')
    database.exec('PRAGMA foreign_keys = ON')
    database.exec(SCHEMA_SQL)
    ensureColumn(database, 'positions', 'quantity_unit', 'TEXT')
    ensureColumn(database, 'positions', 'purchase_date', 'TEXT')
    ensureColumn(database, 'positions', 'isin', 'TEXT')
    // Ohne CHECK: SQLite erlaubt bei ADD COLUMN keine nachträgliche Beschränkung. Die
    // zulässigen Werte gibt der Typ CashType vor, geschrieben wird nur über das Formular.
    ensureColumn(database, 'positions', 'cash_type', 'TEXT')
    // Verweis auf den Sparplan, der diese Buchung erzeugt hat. Ohne Fremdschlüssel, weil ADD
    // COLUMN in SQLite keinen nachträglich hinzufügen kann - das Aufräumen beim Löschen eines
    // Plans übernimmt deshalb savingsPlanRepo.
    ensureColumn(database, 'transactions', 'savings_plan_id', 'INTEGER')
    // Uhrzeit der Sparplan-Ausführung, 'HH:MM'. Nachgereicht, weil die Tabelle bei bestehenden
    // Installationen schon ohne sie angelegt wurde - CREATE TABLE IF NOT EXISTS ergänzt nichts.
    ensureColumn(database, 'savings_plans', 'execution_time', 'TEXT')
    // Konto, auf das ein Budgetposten bucht, und ab welchem Monat. Nachgereicht für bestehende
    // Installationen - CREATE TABLE IF NOT EXISTS ergänzt an einer vorhandenen Tabelle nichts.
    ensureColumn(database, 'budget_items', 'account_position_id', 'INTEGER')
    ensureColumn(database, 'budget_items', 'account_since', 'TEXT')
    ensureColumn(database, 'budget_bookings', 'reverted_at', 'TEXT')

    const seedStmt = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    for (const [key, value] of Object.entries(SEED_SETTINGS)) {
      seedStmt.run(key, value)
    }

    db = database
  }
  return db
}

/** Schließt die Datenbank des offenen Profils; der nächste getDb()-Aufruf öffnet die des dann aktiven. */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
