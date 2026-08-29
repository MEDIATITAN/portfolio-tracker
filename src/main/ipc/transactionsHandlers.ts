import { ipcMain } from 'electron'
import * as transactionsRepo from '../db/transactionsRepo'
import * as csvImportService from '../services/csvImportService'
import type { BrokerFormat } from '../../shared/types'

export function registerTransactionsHandlers(): void {
  ipcMain.handle('transactions:list', () => transactionsRepo.listAllTransactions())

  ipcMain.handle('transactions:importCsv', (event, broker: BrokerFormat, csvText: string) =>
    csvImportService.importCsv(broker, csvText, (progress) => {
      event.sender.send('transactions:import-progress', progress)
    })
  )
}
