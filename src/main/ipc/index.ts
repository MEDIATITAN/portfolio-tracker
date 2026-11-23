import { registerPositionsHandlers } from './positionsHandlers'
import { registerPricesHandlers } from './pricesHandlers'
import { registerSnapshotsHandlers } from './snapshotsHandlers'
import { registerSettingsHandlers } from './settingsHandlers'
import { registerHistoricalHandlers } from './historicalHandlers'
import { registerBudgetHandlers } from './budgetHandlers'
import { registerSavingsPlanHandlers } from './savingsPlanHandlers'
import { registerTransactionsHandlers } from './transactionsHandlers'
import { registerAnalyseHandlers } from './analyseHandlers'
import { registerProfilesHandlers } from './profilesHandlers'

export function registerIpcHandlers(): void {
  registerPositionsHandlers()
  registerPricesHandlers()
  registerSnapshotsHandlers()
  registerSettingsHandlers()
  registerHistoricalHandlers()
  registerBudgetHandlers()
  registerSavingsPlanHandlers()
  registerTransactionsHandlers()
  registerAnalyseHandlers()
  registerProfilesHandlers()
}
