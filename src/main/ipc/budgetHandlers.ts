import { ipcMain } from 'electron'
import * as budgetRepo from '../db/budgetRepo'
import * as budgetBookingService from '../services/budgetBookingService'
import type { BudgetItemUpdate, NewBudgetItem } from '../../shared/types'

export function registerBudgetHandlers(): void {
  ipcMain.handle('budget:list', () => budgetRepo.listBudgetItems())
  ipcMain.handle('budget:create', (_event, input: NewBudgetItem) => {
    const item = budgetRepo.createBudgetItem(input)
    // Sofort buchen: wer ein Konto zuordnet, soll die Wirkung gleich sehen und nicht erst beim
    // nächsten Kursabruf.
    budgetBookingService.runDueBookings()
    return item
  })
  ipcMain.handle('budget:update', (_event, input: BudgetItemUpdate) => {
    const item = budgetRepo.updateBudgetItem(input)
    budgetBookingService.runDueBookings()
    return item
  })
  ipcMain.handle('budget:delete', (_event, id: number) => budgetRepo.deleteBudgetItem(id))
  ipcMain.handle('budget:listBookings', () => budgetBookingService.listBookingMonths())
  ipcMain.handle('budget:runBookings', () => budgetBookingService.runDueBookings())
  ipcMain.handle('budget:undoBookingMonth', (_event, month: string) =>
    budgetBookingService.undoMonth(month)
  )
}
