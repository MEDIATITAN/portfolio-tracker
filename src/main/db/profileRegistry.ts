import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Profile, ProfileList } from '../../shared/types'

/**
 * Welche Profile es gibt und welches offen ist. Jedes Profil hat seine eigene Datenbankdatei -
 * Positionen, Buchungen, Budget und Verläufe zweier Personen vermischen sich so gar nicht erst,
 * und keine Abfrage im Rest der App muss von Profilen wissen. Das Verzeichnis selbst ist eine
 * kleine JSON-Datei neben den Datenbanken, nicht Teil einer von ihnen.
 */
interface StoredProfile extends Profile {
  /** Dateiname der Datenbank im userData-Ordner. */
  file: string
}

interface Registry {
  activeId: string
  profiles: StoredProfile[]
}

/** Das Profil, das es schon vor den Profilen gab: seine Datenbank behält ihren alten Namen. */
const DEFAULT_PROFILE: StoredProfile = {
  id: 'default',
  name: 'Mein Portfolio',
  file: 'portfolio.db'
}

let registry: Registry | null = null

function registryPath(): string {
  return join(app.getPath('userData'), 'profiles.json')
}

function isStoredProfile(value: unknown): value is StoredProfile {
  const p = value as StoredProfile
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.file === 'string' &&
    // Nur ein schlichter Dateiname - die Datei darf nicht aus dem userData-Ordner herausführen.
    /^[\w.-]+\.db$/.test(p.file)
  )
}

function load(): Registry {
  const path = registryPath()
  if (!existsSync(path)) return { activeId: DEFAULT_PROFILE.id, profiles: [DEFAULT_PROFILE] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Registry>
    const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter(isStoredProfile) : []
    if (profiles.length === 0) throw new Error('keine gültigen Profile')
    const activeId = profiles.some((p) => p.id === parsed.activeId)
      ? (parsed.activeId as string)
      : profiles[0].id
    return { activeId, profiles }
  } catch (err) {
    // Eine kaputte Datei nicht stillschweigend überschreiben: beiseitelegen, mit dem
    // Standardprofil weitermachen. Die Datenbanken selbst bleiben unberührt.
    console.error('Profilverzeichnis unlesbar, lege es beiseite:', err)
    renameSync(path, `${path}.defekt-${Date.now()}`)
    return { activeId: DEFAULT_PROFILE.id, profiles: [DEFAULT_PROFILE] }
  }
}

function get(): Registry {
  if (!registry) registry = load()
  return registry
}

function save(next: Registry): void {
  // Erst in eine Nebendatei, dann umbenennen: ein Absturz mitten im Schreiben hinterlässt so nie
  // eine halbe Datei.
  const path = registryPath()
  writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2), 'utf8')
  renameSync(`${path}.tmp`, path)
  registry = next
}

function toPublic({ id, name }: StoredProfile): Profile {
  return { id, name }
}

export function listProfiles(): ProfileList {
  const r = get()
  return { activeId: r.activeId, profiles: r.profiles.map(toPublic) }
}

export function activeProfileFile(): string {
  const r = get()
  return (r.profiles.find((p) => p.id === r.activeId) ?? r.profiles[0]).file
}

export function findProfile(id: string): StoredProfile | undefined {
  return get().profiles.find((p) => p.id === id)
}

export function setActiveProfile(id: string): void {
  const r = get()
  if (!r.profiles.some((p) => p.id === id)) throw new Error('Profil nicht gefunden')
  save({ ...r, activeId: id })
}

export function addProfile(name: string): Profile {
  const r = get()
  const id = `p${Date.now().toString(36)}`
  const profile: StoredProfile = { id, name, file: `portfolio-${id}.db` }
  save({ ...r, profiles: [...r.profiles, profile] })
  return toPublic(profile)
}

export function renameProfile(id: string, name: string): void {
  const r = get()
  if (!r.profiles.some((p) => p.id === id)) throw new Error('Profil nicht gefunden')
  save({ ...r, profiles: r.profiles.map((p) => (p.id === id ? { ...p, name } : p)) })
}

export function removeProfile(id: string): StoredProfile {
  const r = get()
  const profile = r.profiles.find((p) => p.id === id)
  if (!profile) throw new Error('Profil nicht gefunden')
  save({ ...r, profiles: r.profiles.filter((p) => p.id !== id) })
  return profile
}
