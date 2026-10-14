import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

/**
 * "Hakkımızda" and "İletişim" are required on every store (payment-provider
 * review, consumer law). The store footer links them only while the section is
 * visible, so an existing store that has deleted or hidden one gets a one-click
 * fix in the editor.
 */

export type StorePageType = 'about' | 'contact'

export type StorePageGap =
  | { type: StorePageType; state: 'missing' }
  | { type: StorePageType; state: 'hidden'; index: number }

const REQUIRED: readonly StorePageType[] = ['about', 'contact']

/** Required pages a store lacks. Empty for non-store sites. */
export function storeRequiredPageGaps(site: Pick<WebsiteSchema, 'sections'>): StorePageGap[] {
  if (!isStorefront(site as WebsiteSchema)) return []
  const gaps: StorePageGap[] = []
  for (const type of REQUIRED) {
    const matches = site.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section.type === type)
    if (matches.length === 0) gaps.push({ type, state: 'missing' })
    else if (matches.every(({ section }) => section.hidden)) {
      gaps.push({ type, state: 'hidden', index: matches[0].index })
    }
  }
  return gaps
}

const HIDDEN_COPY = {
  tr: {
    about: { text: 'Hakkımızda bölümü gizli; alt bilgideki bağlantısı görünmüyor.', action: 'Göster.' },
    contact: { text: 'İletişim bölümü gizli; alt bilgideki bağlantısı görünmüyor.', action: 'Göster.' },
  },
  en: {
    about: { text: 'The about section is hidden, so its footer link is not shown.', action: 'Show it.' },
    contact: { text: 'The contact section is hidden, so its footer link is not shown.', action: 'Show it.' },
  },
} as const

export function hiddenStorePageCopy(type: StorePageType, lang: string) {
  return HIDDEN_COPY[lang === 'tr' ? 'tr' : 'en'][type]
}
