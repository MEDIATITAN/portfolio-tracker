import { useEffect, useRef, useState } from 'react'
import type { Profile } from '@shared/types'
import {
  useCreateProfile,
  useDeleteProfile,
  useProfiles,
  useRenameProfile,
  useSwitchProfile
} from '../../lib/queries'

/** Feste Farbreihe für die Anfangsbuchstaben - ausgeschrieben, damit Tailwind die Klassen findet. */
const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-violet-500',
  'bg-cyan-500'
]

/** Dieselbe Person behält dieselbe Farbe, egal an welcher Stelle der Liste sie steht. */
function avatarColor(id: string): string {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({
  profile,
  size = 'md'
}: {
  profile: Profile
  size?: 'sm' | 'md'
}): React.JSX.Element {
  const dimensions = size === 'md' ? 'h-7 w-7 text-xs' : 'h-5 w-5 text-[10px]'
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${dimensions} ${avatarColor(profile.id)}`}
    >
      {profile.name.charAt(0).toUpperCase()}
    </span>
  )
}

function ChevronUpDownIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-slate-500"
    >
      <path d="M7 8l3-3 3 3" />
      <path d="M7 12l3 3 3-3" />
    </svg>
  )
}

/** Electron verpackt Fehler aus dem Hauptprozess in "Error invoking remote method 'x': Error: …". */
function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}

type Mode = 'list' | 'create' | 'rename'

/**
 * Wer gerade angezeigt wird, und der Wechsel zu einer anderen Person. Jedes Profil ist eine eigene
 * Datenbank; nach dem Wechsel lädt die Oberfläche neu.
 */
export function ProfileSwitcher(): React.JSX.Element {
  const { data } = useProfiles()
  const createProfile = useCreateProfile()
  const renameProfile = useRenameProfile()
  const deleteProfile = useDeleteProfile()
  const switchProfile = useSwitchProfile()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('list')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const profiles = data?.profiles ?? []
  const active = profiles.find((p) => p.id === data?.activeId)
  const busy = switchProfile.isPending || createProfile.isPending
  // Zielprofil des laufenden Wechsels - ein frisch angelegtes steht womöglich noch nicht in der Liste.
  const switchingTo = switchProfile.isPending
    ? (profiles.find((p) => p.id === switchProfile.variables)?.name ?? 'neuem Profil')
    : null

  useEffect(() => {
    document.title = active ? `Portfolio-Tracker – ${active.name}` : 'Portfolio-Tracker'
  }, [active])

  useEffect(() => {
    if (!open) return
    const close = (): void => {
      setOpen(false)
      setMode('list')
      setError(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    const onPointer = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  const startEditing = (next: Mode): void => {
    setMode(next)
    setDraft(next === 'rename' && active ? active.name : '')
    setError(null)
  }

  const handleSwitch = (id: string): void => {
    setError(null)
    switchProfile.mutate(id, { onError: (err) => setError(errorText(err)) })
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    const name = draft.trim()
    if (!name) {
      setError('Bitte einen Namen eingeben')
      return
    }
    setError(null)
    if (mode === 'create') {
      // Eine neue Person legt man an, um sie einzurichten - also gleich hinwechseln.
      createProfile.mutate(name, {
        onSuccess: (profile) => handleSwitch(profile.id),
        onError: (err) => setError(errorText(err))
      })
    } else if (mode === 'rename' && active) {
      renameProfile.mutate(
        { id: active.id, name },
        {
          onSuccess: () => setMode('list'),
          onError: (err) => setError(errorText(err))
        }
      )
    }
  }

  const handleDelete = (profile: Profile): void => {
    const confirmed = window.confirm(
      `Profil „${profile.name}“ entfernen?\n\n` +
        'Es verschwindet aus der Liste. Die Daten werden nicht gelöscht, sondern als Sicherung ' +
        'im Datenordner der App aufbewahrt.'
    )
    if (!confirmed) return
    setError(null)
    deleteProfile.mutate(profile.id, { onError: (err) => setError(errorText(err)) })
  }

  return (
    <div ref={containerRef} className="relative px-2 pt-3 pb-2">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          setMode('list')
          setError(null)
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-800"
      >
        {active ? (
          <Avatar profile={active} />
        ) : (
          <span className="h-7 w-7 shrink-0 rounded-full bg-slate-700" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            {active?.name ?? 'Portfolio-Tracker'}
          </span>
          <span className="block text-[11px] text-slate-500">
            {profiles.length > 1 ? `${profiles.length} Profile · wechseln` : 'Profile verwalten'}
          </span>
        </span>
        <ChevronUpDownIcon />
      </button>

      {open && (
        <div className="absolute inset-x-2 top-full z-20 mt-1 rounded-md border border-slate-700 bg-slate-800 p-1 shadow-xl">
          <ul className="flex flex-col gap-0.5">
            {profiles.map((profile) => {
              const isActive = profile.id === data?.activeId
              return (
                <li key={profile.id} className="group flex items-center rounded hover:bg-slate-700">
                  <button
                    type="button"
                    disabled={isActive || busy}
                    onClick={() => handleSwitch(profile.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm disabled:cursor-default"
                  >
                    <Avatar profile={profile} size="sm" />
                    <span
                      className={`truncate ${isActive ? 'font-medium text-white' : 'text-slate-300'}`}
                    >
                      {profile.name}
                    </span>
                    {isActive && <span className="ml-auto text-xs text-blue-400">✓</span>}
                  </button>
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => handleDelete(profile)}
                      disabled={busy}
                      aria-label={`Profil ${profile.name} entfernen`}
                      title="Profil entfernen"
                      className="mr-1 rounded px-1.5 py-0.5 text-xs text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-600 hover:text-red-300 focus:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-1 border-t border-slate-700 pt-1">
            {mode === 'list' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => startEditing('create')}
                  className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-700"
                >
                  + Person hinzufügen
                </button>
                {active && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEditing('rename')}
                    className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-700"
                  >
                    „{active.name}“ umbenennen
                  </button>
                )}
              </>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 p-1">
                <label className="text-[11px] text-slate-400">
                  {mode === 'create' ? 'Name der Person' : 'Neuer Name'}
                </label>
                <input
                  autoFocus
                  value={draft}
                  maxLength={40}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={mode === 'create' ? 'z. B. Anna' : undefined}
                  className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={busy || renameProfile.isPending}
                    className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                  >
                    {mode === 'create' ? 'Anlegen' : 'Speichern'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing('list')}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-700"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            )}
          </div>

          {switchingTo && (
            <p className="px-2 py-1.5 text-xs text-slate-400">Wechsle zu {switchingTo} …</p>
          )}
          {error && <p className="px-2 py-1.5 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  )
}
