import { getDb } from './index'
import type { Settings } from '../../shared/types'

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as unknown as {
    key: string
    value: string
  }[]
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    baseCurrency: map.base_currency ?? 'EUR',
    autoRefreshEnabled: map.auto_refresh_enabled === '1',
    autoRefreshIntervalMinutes: Number(map.auto_refresh_interval_minutes ?? 60)
  }
}

export function setSettings(input: Partial<Settings>): Settings {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  if (input.baseCurrency !== undefined) upsert.run('base_currency', input.baseCurrency)
  if (input.autoRefreshEnabled !== undefined)
    upsert.run('auto_refresh_enabled', input.autoRefreshEnabled ? '1' : '0')
  if (input.autoRefreshIntervalMinutes !== undefined)
    upsert.run('auto_refresh_interval_minutes', String(input.autoRefreshIntervalMinutes))
  return getSettings()
}
