// Modul-weiter Zustand (nicht React-State), damit der Zeitpunkt auch beim Unmount/Mount der
// Seiten beim Tab-Wechsel erhalten bleibt und nicht bei jedem Seitenwechsel neu bei 0 anfängt.
let lastAutoRefreshAt = 0
const MIN_INTERVAL_MS = 2 * 60 * 1000

/** true nur, wenn seit dem letzten automatischen Refresh genug Zeit vergangen ist - verhindert
 *  API-Spam bei schnellem Hin- und Herwechseln zwischen den Tabs. Der manuelle Button umgeht das bewusst. */
export function shouldAutoRefresh(): boolean {
  const now = Date.now()
  if (now - lastAutoRefreshAt < MIN_INTERVAL_MS) return false
  lastAutoRefreshAt = now
  return true
}
