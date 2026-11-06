export const GOOGLE_ADS_RISK_THRESHOLDS = {
  recommendedBudgetMultiplier: 3,
  recentDailySpendMultiplier: 3,
  previousBudgetMultiplier: 10,
  absoluteTryMinor: 100_000,
  absoluteMinorByCurrency: {
    USD: 2_500,
    EUR: 2_300,
    GBP: 1_900,
    CAD: 3_400,
    AUD: 3_700,
    AED: 10_000,
    JPY: 5_000,
    KRW: 30_000,
  },
} as const

export type GoogleAdsAmountRiskReason =
  | 'above_plan_cap'
  | 'above_recommendation'
  | 'above_recent_spend'
  | 'tenfold_previous_budget'
  | 'absolute_threshold'

export type GoogleAdsAmountRisk = {
  risky: boolean
  reasons: GoogleAdsAmountRiskReason[]
  absoluteThresholdMinor: number
}

export function googleAdsAbsoluteRiskThresholdMinor(currency: string): number {
  if (currency === 'TRY') return GOOGLE_ADS_RISK_THRESHOLDS.absoluteTryMinor
  return GOOGLE_ADS_RISK_THRESHOLDS.absoluteMinorByCurrency[
    currency as keyof typeof GOOGLE_ADS_RISK_THRESHOLDS.absoluteMinorByCurrency
  ] ?? 1
}

export function evaluateGoogleAdsAmountRisk(input: {
  amountMinor: number
  currency: string
  recommendedDailyBudgetMinor?: number | null
  planBudgetCapMinor?: number | null
  averageDailySpend30dMinor?: number | null
  previousDailyBudgetMinor?: number | null
}): GoogleAdsAmountRisk {
  const reasons: GoogleAdsAmountRiskReason[] = []
  const amount = input.amountMinor
  const threshold = googleAdsAbsoluteRiskThresholdMinor(input.currency)

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { risky: false, reasons, absoluteThresholdMinor: threshold }
  }

  const planBudgetCap = input.planBudgetCapMinor
  if (Number.isSafeInteger(planBudgetCap) && planBudgetCap! > 0 && amount > planBudgetCap!) {
    reasons.push('above_plan_cap')
  }

  const recommended = input.recommendedDailyBudgetMinor
  if (Number.isFinite(recommended) && recommended! > 0 &&
    amount > recommended! * GOOGLE_ADS_RISK_THRESHOLDS.recommendedBudgetMultiplier) {
    reasons.push('above_recommendation')
  }

  const averageSpend = input.averageDailySpend30dMinor
  if (Number.isFinite(averageSpend) && averageSpend! > 0 &&
    amount > averageSpend! * GOOGLE_ADS_RISK_THRESHOLDS.recentDailySpendMultiplier) {
    reasons.push('above_recent_spend')
  }

  const previous = input.previousDailyBudgetMinor
  if (Number.isSafeInteger(previous) && previous! > 0 &&
    amount >= previous! * GOOGLE_ADS_RISK_THRESHOLDS.previousBudgetMultiplier) {
    reasons.push('tenfold_previous_budget')
  }

  if (amount > threshold) reasons.push('absolute_threshold')

  return { risky: reasons.length > 0, reasons, absoluteThresholdMinor: threshold }
}

export function googleAdsRiskConfirmationError(input: {
  risky: boolean
  amountMinor: number
  riskConfirmedAmountMinor?: number | null
}): 'risk_confirmation_required' | 'risk_confirmation_mismatch' | null {
  const confirmed = input.riskConfirmedAmountMinor ?? null
  if (!input.risky) return confirmed === null ? null : 'risk_confirmation_mismatch'
  if (confirmed === null) return 'risk_confirmation_required'
  return confirmed === input.amountMinor ? null : 'risk_confirmation_mismatch'
}

export function googleAdsMonthlyBudgetUpperBoundMinor(dailyBudgetMinor: number): number {
  if (!Number.isSafeInteger(dailyBudgetMinor) || dailyBudgetMinor < 0) return 0
  const monthly = Math.ceil(dailyBudgetMinor * 30.4)
  return Number.isSafeInteger(monthly) ? monthly : Number.MAX_SAFE_INTEGER
}
