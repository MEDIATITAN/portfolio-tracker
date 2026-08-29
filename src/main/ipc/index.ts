import { registerPositionsHandlers } from './positionsHandlers'
import { registerPricesHandlers } from './pricesHandlers'
import { registerSnapshotsHandlers } from './snapshotsHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerHistoricalHandlers } from './historicalHandlers'
import { registerTransactionsHandlers } from './transactionsHandlers'

export function registerIpcHandlers(): void {
  registerPositionsHandlers()
  registerPricesHandlers()
  registerSnapshotsHandlers()
  registerSettingsHandlers()
  registerHistoricalHandlers()
  registerTransactionsHandlers()
}
