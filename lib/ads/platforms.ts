import type { ComponentType } from 'react'
import type { AdsPlatform, AdsProviderStatus } from '@/lib/ads/providers/types'
import type { AdsPlatformIconName } from '@/components/ads/sections/ads-platform-icon'

type AdsPlatformNameKey =
  | 'platformGoogleName'
  | 'platformMetaName'
  | 'platformTiktokName'
  | 'platformXName'
  | 'platformLinkedinName'
  | 'platformWhatsappName'

type AdsPlatformBodyKey =
  | 'platformGoogleBody'
  | 'platformMetaBody'
  | 'platformTiktokBody'
  | 'platformXBody'
  | 'platformLinkedinBody'
  | 'platformWhatsappBody'

export type AdsPlatformCatalogId = AdsPlatform | 'whatsapp'
type AdsPlatformLogoComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export type AdsPlatformDefinition = {
  id: AdsPlatformCatalogId
  label: string
  status: AdsProviderStatus
  accentColor: string
  nameKey: AdsPlatformNameKey
  bodyKey: AdsPlatformBodyKey
  icon: AdsPlatformIconName
  logo?: AdsPlatformLogoComponent | string
}

export const ADS_PLATFORM_REGISTRY = [
  {
    id: 'google_ads',
    label: 'Google Ads',
    status: 'available',
    accentColor: '#4285f4',
    nameKey: 'platformGoogleName',
    bodyKey: 'platformGoogleBody',
    icon: 'googleads',
  },
  {
    id: 'meta',
    label: 'Meta Ads',
    status: 'coming_soon',
    accentColor: '#0866ff',
    nameKey: 'platformMetaName',
    bodyKey: 'platformMetaBody',
    icon: 'meta',
  },
  {
    id: 'tiktok',
    label: 'TikTok Ads',
    status: 'coming_soon',
    accentColor: '#ff0050',
    nameKey: 'platformTiktokName',
    bodyKey: 'platformTiktokBody',
    icon: 'tiktok',
  },
  {
    id: 'x',
    label: 'X Ads',
    status: 'coming_soon',
    accentColor: '#111111',
    nameKey: 'platformXName',
    bodyKey: 'platformXBody',
    icon: 'x',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Ads',
    status: 'coming_soon',
    accentColor: '#0a66c2',
    nameKey: 'platformLinkedinName',
    bodyKey: 'platformLinkedinBody',
    icon: 'linkedin',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Ads',
    status: 'coming_soon',
    accentColor: '#25d366',
    nameKey: 'platformWhatsappName',
    bodyKey: 'platformWhatsappBody',
    icon: 'whatsapp',
  },
] as const satisfies readonly AdsPlatformDefinition[]

export function getAdsPlatformDefinition(platformId: string | null | undefined): AdsPlatformDefinition | undefined {
  if (!platformId) return undefined
  return ADS_PLATFORM_REGISTRY.find((platform) => platform.id === platformId)
}
