import { handle } from './handle'
import * as budgetRepo from '../db/budgetRepo'
import * as budgetBookingService from '../services/budgetBookingService'
import type { BudgetItemUpdate, NewBudgetItem } from '../../shared/types'

export function registerBudgetHandlers(): void {
  handle('budget:list', () => budgetRepo.listBudgetItems())
  handle('budget:create', (_event, input: NewBudgetItem) => {
    const item = budgetRepo.createBudgetItem(input)
    // Sofort buchen: wer ein Konto zuordnet, soll die Wirkung gleich sehen und nicht erst beim
    // nächsten Kursabruf.
    budgetBookingService.runDueBookings()
    return item
  })
  handle('budget:update', (_event, input: BudgetItemUpdate) => {
    const item = budgetRepo.updateBudgetItem(input)
    budgetBookingService.runDueBookings()
    return item
  })
  handle('budget:delete', (_event, id: number) => budgetRepo.deleteBudgetItem(id))
  handle('budget:listBookings', () => budgetBookingService.listBookingMonths())
  handle('budget:runBookings', () => budgetBookingService.runDueBookings())
  handle('budget:undoBookingMonth', (_event, month: string) =>
    budgetBookingService.undoMonth(month)
  )
}
