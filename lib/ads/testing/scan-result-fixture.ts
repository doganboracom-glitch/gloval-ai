import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'

export const sampleScanResult: PublicScanResult = {
  host: 'ornek.com',
  mode: 'free',
  plan: {
    brand: 'Örnek Diş Kliniği',
    sector: 'health',
    sectorLabel: 'Diş kliniği',
    services: ['İmplant', 'Diş beyazlatma'],
    language: 'tr',
    languageFallback: false,
    country: 'TR',
    cities: ['İstanbul'],
    keywords: ['diş implant fiyatları', 'istanbul diş kliniği'],
    negativeKeywords: ['ücretsiz'],
  },
  ad: {
    headlines: ['Diş İmplant Uzmanı', 'İstanbul Diş Kliniği', 'Randevu Alın'],
    descriptions: ['Deneyimli ekibimizle implant ve beyazlatma.', 'Hemen randevu oluşturun.'],
    displayUrl: 'ornek.com/implant',
  },
  budget: { currency: 'TRY', competitiveness: 'medium', daily: 300, maxDaily: 600, maxMonthly: 9120 },
  restricted: [],
}
