import { handle } from './handle'
import * as savingsPlanRepo from '../db/savingsPlanRepo'
import * as savingsPlanService from '../services/savingsPlanService'
import * as priceService from '../services/priceService'
import type { NewSavingsPlan, SavingsPlanUpdate } from '../../shared/types'

/**
 * Erst die Kursreihe bis zum Planbeginn verlängern, dann buchen. Ohne den ersten Schritt fände ein
 * Plan, der vor dem Anlegen der Position startet, für seine ersten Ausführungen keinen Kurs.
 */
async function bookDueExecutions(): Promise<number> {
  await priceService.ensureHistoryForSavingsPlans()
  return savingsPlanService.runDuePlans()
}

export function registerSavingsPlanHandlers(): void {
  handle('savingsPlans:list', () => savingsPlanService.listWithStats())
  handle('savingsPlans:create', async (_event, input: NewSavingsPlan) => {
    const plan = savingsPlanRepo.createSavingsPlan(input)
    // Direkt nachbuchen: legt jemand einen Plan mit Startdatum in der Vergangenheit an, soll er
    // seine Ausführungen sofort sehen und nicht erst beim nächsten Kursabruf.
    await bookDueExecutions()
    return plan
  })
  handle('savingsPlans:update', async (_event, input: SavingsPlanUpdate) => {
    const plan = savingsPlanRepo.updateSavingsPlan(input)
    await bookDueExecutions()
    return plan
  })
  handle('savingsPlans:delete', (_event, id: number) => savingsPlanRepo.deleteSavingsPlan(id))
  handle('savingsPlans:run', () => bookDueExecutions())
}
