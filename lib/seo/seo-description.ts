export const SEO_DESCRIPTION_MAX_LENGTH = 160

const LEGACY_GENERATED_MARKER = /GLOVAL\s+AI\s+ile\s+oluşturuldu/iu

function decodeCommonHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#0*34;/gi, '"')
    .replace(/&apos;|&#0*39;/gi, "'")
    .replace(/&amp;/gi, '&')
}

export function seoDescriptionPlainText(value: string): string {
  return decodeCommonHtmlEntities(value)
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\s\u00a0]+/gu, ' ')
    .trim()
}

export function sanitizeSeoDescription(value: string): string {
  return Array.from(seoDescriptionPlainText(value))
    .slice(0, SEO_DESCRIPTION_MAX_LENGTH)
    .join('')
    .trimEnd()
}

export function isLegacyGeneratedDescription(value: string): boolean {
  return LEGACY_GENERATED_MARKER.test(seoDescriptionPlainText(value))
}

/** Empty for old platform-generated copy; otherwise plain text capped for metadata. */
export function resolveSeoDescription(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const plainText = seoDescriptionPlainText(value)
  if (!plainText || LEGACY_GENERATED_MARKER.test(plainText)) return ''

  return Array.from(plainText)
    .slice(0, SEO_DESCRIPTION_MAX_LENGTH)
    .join('')
    .trimEnd()
}

/** Only let a whole-site AI edit replace the owner-authored metadata on request. */
export function shouldAllowAiSeoDescriptionEdit(instruction: string): boolean {
  const normalized = instruction
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
  const hasMetadataTarget = /(?:^|[^\p{L}\p{N}])(?:seo|meta|google|search|arama|site)(?=$|[^\p{L}\p{N}])/u.test(
    normalized,
  )
  const hasDescriptionTerm = /(?:^|[^\p{L}\p{N}])(?:aciklama\p{L}*|description\p{L}*|snippet\p{L}*)(?=$|[^\p{L}\p{N}])/u.test(
    normalized,
  )

  return hasMetadataTarget && hasDescriptionTerm
}
