import type { DisplayClass } from '@shared/displayClass'

export type Page =
  'dashboard' | 'positions' | 'pnl' | 'analyse' | 'transactions' | 'budget' | 'savingsPlans'
export type ClassFilter = DisplayClass | 'ALL'
