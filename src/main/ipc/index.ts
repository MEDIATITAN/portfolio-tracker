import { registerPositionsHandlers } from './positionsHandlers'
import { registerPricesHandlers } from './pricesHandlers'
import { registerSnapshotsHandlers } from './snapshotsHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerHistoricalHandlers } from './historicalHandlers'

export function registerIpcHandlers(): void {
  registerPositionsHandlers()
  registerPricesHandlers()
  registerSnapshotsHandlers()
  registerSettingsHandlers()
  registerHistoricalHandlers()
}
