/** Client-safe Meta Ads types and helpers (no server-only imports). */

/**
 * Permissions every connection must have; a missing one rejects the connect.
 * M2 will append `ads_management` and `pages_manage_ads` here (and only here).
 */
export const META_REQUIRED_SCOPES = ['ads_read', 'business_management', 'pages_show_list'] as const
/** Permissions that unlock extra features; a missing one never rejects the connect. */
export const META_OPTIONAL_SCOPES = ['pages_read_engagement'] as const
export type MetaRequiredScope = (typeof META_REQUIRED_SCOPES)[number]
export type MetaOptionalScope = (typeof META_OPTIONAL_SCOPES)[number]
export type MetaScope = MetaRequiredScope | MetaOptionalScope

/** Scope-mode login asks for both lists; config_id mode takes them from the Meta app Configuration. */
export const META_REQUESTED_SCOPES: readonly MetaScope[] = [...META_REQUIRED_SCOPES, ...META_OPTIONAL_SCOPES]

export function missingMetaRequiredScopes(granted: readonly string[]): MetaRequiredScope[] {
  return META_REQUIRED_SCOPES.filter((scope) => !granted.includes(scope))
}

/**
 * Third list (phase M2): permissions needed to create paused campaigns. A read-only connection that lacks them is
 * still valid; the Plans tab just asks the owner to grant them.
 */
export const META_PUBLISH_SCOPES = ['ads_management', 'pages_read_engagement'] as const
export type MetaPublishScope = (typeof META_PUBLISH_SCOPES)[number]

/** Scope-mode "grant publishing" login: the read scopes plus the write permissions, de-duplicated. */
export const META_MANAGE_REQUESTED_SCOPES: readonly string[] = [
  ...new Set<string>([...META_REQUESTED_SCOPES, ...META_PUBLISH_SCOPES]),
]

export function missingMetaPublishScopes(granted: readonly string[]): MetaPublishScope[] {
  return META_PUBLISH_SCOPES.filter((scope) => !granted.includes(scope))
}

export function missingMetaOptionalScopes(granted: readonly string[]): MetaOptionalScope[] {
  return META_OPTIONAL_SCOPES.filter((scope) => !granted.includes(scope))
}

export const META_RANGES = ['7d', '30d', '90d'] as const
export type MetaAdsRange = (typeof META_RANGES)[number]

export const META_DATE_PRESETS: Record<MetaAdsRange, string> = {
  '7d': 'last_7d',
  '30d': 'last_30d',
  '90d': 'last_90d',
}

export const META_TOKEN_WARNING_DAYS = 7

export type MetaAdAccountCandidate = {
  /** Always `act_<digits>`. */
  externalAccountId: string
  name: string | null
  currency: string | null
  /** Graph `account_status` (1 active, 2 disabled, 3 unsettled, 7 risk review, 9 grace period, 101 closed, ...). */
  accountStatus: number | null
  businessId: string | null
}

export type MetaPageCandidate = {
  pageId: string
  pageName: string | null
}

/** Read from the ad account's `instagram_accounts` edge (needs only `ads_read`). */
export type MetaInstagramAccount = {
  id: string
  username: string | null
}

export type MetaInsightRow = {
  impressions: number
  clicks: number
  /** Account currency, major units. */
  spend: number
  reach: number
  ctr: number | null
  cpc: number | null
}

export type MetaCampaignReport = MetaInsightRow & {
  id: string
  name: string
  status: string | null
  effectiveStatus: string | null
  dailyBudgetMinor: number | null
  lifetimeBudgetMinor: number | null
}

export type MetaPerformanceReport = {
  range: MetaAdsRange
  currency: string | null
  accountStatus: number | null
  totals: MetaInsightRow
  campaigns: MetaCampaignReport[]
}

export type MetaConnectionView = {
  id: string
  externalAccountId: string
  name: string | null
  currency: string | null
  status: 'active' | 'revoked' | 'error'
  lastError: string | null
  createdAt: string
  tokenExpiresAt: string | null
  pageName: string | null
  instagramAccountName: string | null
  accountStatus: number | null
  /** Optional permissions the owner did not grant; the matching feature shows "permission needed". */
  missingOptionalScopes: MetaOptionalScope[]
  /** Write permissions still missing for paused publishing (empty = management permission granted). */
  missingPublishScopes: MetaPublishScope[]
  /** True when a Facebook Page is linked; publishing needs one. */
  hasPage: boolean
  /** True when an Instagram account is linked, so Instagram placements can carry the creative. */
  hasInstagram: boolean
}

const ACCOUNT_STATUS_LABELS: Record<number, { tr: string; en: string; healthy: boolean }> = {
  1: { tr: 'Etkin', en: 'Active', healthy: true },
  2: { tr: 'Devre dışı', en: 'Disabled', healthy: false },
  3: { tr: 'Ödenmemiş bakiye', en: 'Unsettled balance', healthy: false },
  7: { tr: 'Risk incelemesinde', en: 'Under risk review', healthy: false },
  8: { tr: 'Ödeme bekleniyor', en: 'Pending settlement', healthy: false },
  9: { tr: 'Ek süre dönemi', en: 'Grace period', healthy: false },
  100: { tr: 'Kapatma bekleniyor', en: 'Pending closure', healthy: false },
  101: { tr: 'Kapalı', en: 'Closed', healthy: false },
  201: { tr: 'Herhangi bir hesap etkin değil', en: 'Any active', healthy: false },
  202: { tr: 'Kapalı', en: 'Closed', healthy: false },
}

export function metaAccountStatusLabel(status: number | null, isTr: boolean): { label: string; healthy: boolean } {
  if (status === null) return { label: isTr ? 'Bilinmiyor' : 'Unknown', healthy: false }
  const entry = ACCOUNT_STATUS_LABELS[status]
  if (!entry) return { label: isTr ? `Durum ${status}` : `Status ${status}`, healthy: false }
  return { label: isTr ? entry.tr : entry.en, healthy: entry.healthy }
}

/** Whole days until `iso`; negative when already past; null when unknown. */
export function metaTokenDaysRemaining(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return Math.floor((time - now) / 86_400_000)
}

export function metaCurrencyFractionDigits(currency: string | null): number {
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return 2
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** Meta budgets are strings in the currency's minor unit. */
export function metaMinorToMajor(minor: number | null, currency: string | null): number | null {
  if (minor === null || !Number.isFinite(minor)) return null
  return minor / 10 ** metaCurrencyFractionDigits(currency)
}

export function metaCampaignStatusLabel(status: string | null, isTr: boolean): string {
  switch (status) {
    case 'ACTIVE': return isTr ? 'Etkin' : 'Active'
    case 'PAUSED': return isTr ? 'Duraklatıldı' : 'Paused'
    case 'ARCHIVED': return isTr ? 'Arşivlendi' : 'Archived'
    case 'DELETED': return isTr ? 'Silindi' : 'Deleted'
    case 'IN_PROCESS': return isTr ? 'İşleniyor' : 'In process'
    case 'WITH_ISSUES': return isTr ? 'Sorunlu' : 'With issues'
    case 'PENDING_REVIEW': return isTr ? 'İncelemede' : 'In review'
    case 'DISAPPROVED': return isTr ? 'Reddedildi' : 'Disapproved'
    case 'CAMPAIGN_PAUSED': return isTr ? 'Kampanya duraklatıldı' : 'Campaign paused'
    default: return status ?? (isTr ? 'Bilinmiyor' : 'Unknown')
  }
}
