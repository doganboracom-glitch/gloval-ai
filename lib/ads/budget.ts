/**
 * Daily budget suggestion. The model only says how competitive the sector is;
 * the numbers come from this table and nowhere else.
 *
 * Google may spend up to 2x the daily budget on a single day and caps the month
 * at 30.4x the daily budget, so those two figures are what a visitor is shown as
 * the worst case.
 */

export type Competitiveness = 'low' | 'medium' | 'high'

export const COMPETITIVENESS_LEVELS: readonly Competitiveness[] = ['low', 'medium', 'high']

export const DAILY_BUDGET_TRY: Record<Competitiveness, number> = {
  low: 150,
  medium: 300,
  high: 600,
}

export const MAX_DAILY_SPEND_FACTOR = 2
export const MAX_MONTHLY_SPEND_FACTOR = 30.4

export type BudgetSuggestion = {
  currency: 'TRY'
  competitiveness: Competitiveness
  daily: number
  maxDaily: number
  maxMonthly: number
}

export function suggestBudget(competitiveness: Competitiveness): BudgetSuggestion {
  const daily = DAILY_BUDGET_TRY[competitiveness]
  return {
    currency: 'TRY',
    competitiveness,
    daily,
    maxDaily: daily * MAX_DAILY_SPEND_FACTOR,
    maxMonthly: Math.round(daily * MAX_MONTHLY_SPEND_FACTOR),
  }
}
