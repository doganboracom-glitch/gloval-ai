import { z } from 'zod'

export const googleAdsRecommendationSchema = z.object({
  type: z.enum(['kampanya', 'anahtar_kelime', 'arama_terimi', 'butce', 'olcum']),
  why: z.string().min(10).max(500),
  campaignName: z.string().max(160).nullable(),
  keyword: z.string().max(240).nullable(),
  recommendedAction: z.string().min(10).max(500),
  confidence: z.enum(['dusuk', 'orta', 'yuksek']),
  estimatedMonthlySavingsMicros: z.number().min(0).max(1_000_000_000_000).nullable(),
})

export const googleAdsAnalysisSchema = z.object({
  summary: z.string().min(20).max(700),
  whatWorks: z.string().min(10).max(400),
  waste: z.string().min(10).max(400),
  recommendations: z.array(googleAdsRecommendationSchema).length(3),
  savingsDisclaimer: z.string().min(10).max(300),
})

export type GoogleAdsRecommendation = z.infer<typeof googleAdsRecommendationSchema>
export type GoogleAdsAnalysis = z.infer<typeof googleAdsAnalysisSchema>

export function canRunDailyGoogleAdsAnalysis(used: number, limit = 3): boolean {
  return Number.isInteger(used) && Number.isInteger(limit) && used >= 0 && limit > 0 && used < limit
}

export function deriveAnalysisSavingsCeiling(input: {
  reportDays: number
  currentSpendMicros: number
  conversions: number
  hasSufficientData: boolean
}): number | null {
  if (!input.hasSufficientData || input.reportDays < 7 || input.conversions > 0 || input.currentSpendMicros <= 0) return null
  return (input.currentSpendMicros / input.reportDays) * 30
}
