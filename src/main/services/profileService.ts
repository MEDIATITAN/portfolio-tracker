import { app } from 'electron'
import { existsSync, renameSync } from 'fs'
import { join } from 'path'
import { closeDb } from '../db'
import * as profileRegistry from '../db/profileRegistry'
import { runExclusive } from '../ipc/handle'
import { prepareDatabase } from './databaseSetup'
import type { Profile } from '../../shared/types'

const MAX_NAME_LENGTH = 40

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) throw new Error('Bitte einen Namen eingeben')
  return trimmed
}

export function createProfile(name: string): Profile {
  return profileRegistry.addProfile(cleanName(name))
}

export function renameProfile(id: string, name: string): void {
  profileRegistry.renameProfile(id, cleanName(name))
}

/**
 * Wechselt die offene Datenbank. Wartet, bis laufende Aufrufe fertig sind (siehe runExclusive);
 * schlägt das Öffnen der neuen fehl, bleibt das bisherige Profil offen.
 */
export async function switchProfile(id: string): Promise<void> {
  if (!profileRegistry.findProfile(id)) throw new Error('Profil nicht gefunden')
  await runExclusive(() => {
    const previous = profileRegistry.listProfiles().activeId
    if (previous === id) return
    closeDb()
    profileRegistry.setActiveProfile(id)
    try {
      prepareDatabase()
    } catch (err) {
      closeDb()
      profileRegistry.setActiveProfile(previous)
      prepareDatabase()
      throw err
    }
  })
}

/**
 * Entfernt ein Profil aus der Liste. Die Datenbankdatei wird nicht gelöscht, sondern umbenannt -
 * ein versehentlicher Klick kostet so nicht die Daten einer Person; wer sie wirklich los sein
 * will, löscht die Datei im userData-Ordner von Hand.
 */
export function deleteProfile(id: string): void {
  const { activeId, profiles } = profileRegistry.listProfiles()
  if (id === activeId) throw new Error('Das geöffnete Profil kann nicht gelöscht werden')
  if (profiles.length <= 1) throw new Error('Das letzte Profil kann nicht gelöscht werden')
  const removed = profileRegistry.removeProfile(id)
  const base = join(app.getPath('userData'), removed.file)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(base + suffix)) renameSync(base + suffix, `${base}.geloescht-${stamp}${suffix}`)
  }
}
