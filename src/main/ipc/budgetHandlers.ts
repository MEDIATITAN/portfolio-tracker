import { ipcMain } from 'electron'
import * as budgetRepo from '../db/budgetRepo'
import type { BudgetItemUpdate, NewBudgetItem } from '../../shared/types'

export function registerBudgetHandlers(): void {
  ipcMain.handle('budget:list', () => budgetRepo.listBudgetItems())
  ipcMain.handle('budget:create', (_event, input: NewBudgetItem) =>
    budgetRepo.createBudgetItem(input)
  )
  ipcMain.handle('budget:update', (_event, input: BudgetItemUpdate) =>
    budgetRepo.updateBudgetItem(input)
  )
  ipcMain.handle('budget:delete', (_event, id: number) => budgetRepo.deleteBudgetItem(id))
}
