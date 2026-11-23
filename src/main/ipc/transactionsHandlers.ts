import { handle } from './handle'
import * as transactionsRepo from '../db/transactionsRepo'
import * as csvImportService from '../services/csvImportService'
import * as ledgerService from '../services/ledgerService'
import type { BrokerFormat } from '../../shared/types'

export function registerTransactionsHandlers(): void {
  handle('transactions:list', () => transactionsRepo.listAllTransactions())

  handle('transactions:delete', (_event, id: number) => ledgerService.deleteTransaction(id))

  handle('transactions:importCsv', (event, broker: BrokerFormat, csvText: string) =>
    csvImportService.importCsv(broker, csvText, (progress) => {
      event.sender.send('transactions:import-progress', progress)
    })
  )
}
