import { ipcMain } from 'electron'
import * as profileRegistry from '../db/profileRegistry'
import * as profileService from '../services/profileService'

// Bewusst direkt über ipcMain statt über `handle`: diese Aufrufe lesen keine Portfolio-Datenbank,
// und der Wechsel wartet auf das Ende aller über `handle` laufenden Aufrufe - zählte er selbst
// mit, wartete er auf sich.
export function registerProfilesHandlers(): void {
  ipcMain.handle('profiles:list', () => profileRegistry.listProfiles())
  ipcMain.handle('profiles:create', (_event, name: string) => profileService.createProfile(name))
  ipcMain.handle('profiles:rename', (_event, id: string, name: string) =>
    profileService.renameProfile(id, name)
  )
  ipcMain.handle('profiles:delete', (_event, id: string) => profileService.deleteProfile(id))
  ipcMain.handle('profiles:switch', (_event, id: string) => profileService.switchProfile(id))
}
