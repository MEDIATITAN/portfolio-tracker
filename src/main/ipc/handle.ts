import { ipcMain, type IpcMainInvokeEvent } from 'electron'

/**
 * Alle Datenbank-Handler laufen über diese Hülle statt direkt über ipcMain.handle. Sie zählt, wie
 * viele Aufrufe gerade laufen, damit ein Profilwechsel warten kann, bis sie fertig sind: ein
 * Kursabruf, der vor dem Wechsel startet und danach schreibt, landete sonst in der Datenbank der
 * anderen Person - samt Snapshot mit ihrem Vermögen.
 */
let active = 0
/** Solange ein Wechsel läuft, warten neue Aufrufe, statt die halb umgestellte Datenbank zu sehen. */
let gate: Promise<void> | null = null

export function handle<TArgs extends unknown[], TResult>(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: TArgs) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    while (gate) await gate
    active++
    try {
      return await listener(event, ...(args as TArgs))
    } finally {
      active--
    }
  })
}

/** Wie lange ein Wechsel auf laufende Aufrufe wartet - ein großer CSV-Import darf fertig werden. */
const DRAIN_TIMEOUT_MS = 120_000

/**
 * Führt `fn` aus, sobald kein Datenbank-Aufruf mehr läuft, und hält neue so lange zurück. Der
 * Profilwechsel selbst darf deshalb NICHT über `handle` registriert sein - er wartete auf sich.
 */
export async function runExclusive<T>(fn: () => T): Promise<T> {
  while (gate) await gate
  let release!: () => void
  gate = new Promise((resolve) => (release = resolve))
  try {
    const started = Date.now()
    while (active > 0) {
      if (Date.now() - started > DRAIN_TIMEOUT_MS) {
        throw new Error(
          'Es läuft noch eine Aktualisierung oder ein Import - bitte gleich noch einmal versuchen.'
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return fn()
  } finally {
    gate = null
    release()
  }
}
