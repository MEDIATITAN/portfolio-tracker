import { ipcMain } from 'electron'
import * as settingsRepo from '../db/settingsRepo'
import type { Settings } from '../../shared/types'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => settingsRepo.getSettings())
  ipcMain.handle('settings:set', (_event, input: Partial<Settings>) => settingsRepo.setSettings(input))
}
