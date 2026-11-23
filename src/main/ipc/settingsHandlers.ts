import { handle } from './handle'
import * as settingsRepo from '../db/settingsRepo'
import type { Settings } from '../../shared/types'

export function registerSettingsHandlers(): void {
  handle('settings:get', () => settingsRepo.getSettings())
  handle('settings:set', (_event, input: Partial<Settings>) => settingsRepo.setSettings(input))
}
