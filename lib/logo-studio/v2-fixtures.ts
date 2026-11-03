import type { LogoMetalTone } from './rules'
import type { LogoStudioLocale, LogoStudioSectorId } from './v2'

export type LogoStudioV2ShowcaseFixture = {
  brand: string
  sectorId: LogoStudioSectorId
  sectorLabel: Record<LogoStudioLocale, string>
  motif: string
  motifId: string
  tone: LogoMetalTone
}

export const LOGO_STUDIO_V2_SHOWCASE_FIXTURES: readonly LogoStudioV2ShowcaseFixture[] = [
  {
    brand: 'ARMEN',
    sectorId: 'construction',
    sectorLabel: { tr: 'İnşaat', en: 'Construction' },
    motif: 'Kemer kilit taşı',
    motifId: 'keystone',
    tone: 'gold',
  },
  {
    brand: 'LUNA',
    sectorId: 'beauty',
    sectorLabel: { tr: 'Mücevher', en: 'Jewelry' },
    motif: 'Dört tırnaklı taş yuvası',
    motifId: 'bezel',
    tone: 'silver',
  },
  {
    brand: 'DJ PERFORMANCE',
    sectorId: 'events',
    sectorLabel: { tr: 'DJ performansı', en: 'DJ performance' },
    motif: 'Plak ve ton kolu',
    motifId: 'turntable',
    tone: 'bronze',
  },
  {
    brand: 'SOFRA',
    sectorId: 'food',
    sectorLabel: { tr: 'Restoran', en: 'Restaurant' },
    motif: 'Servis kubbesi',
    motifId: 'cloche',
    tone: 'gold',
  },
  {
    brand: 'ADALET',
    sectorId: 'legal',
    sectorLabel: { tr: 'Hukuk', en: 'Law' },
    motif: 'Denge terazisi',
    motifId: 'scales',
    tone: 'silver',
  },
]
