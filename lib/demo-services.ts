import { getCatalog, type CatalogItem } from '@/lib/demo-catalog'
import { syncServicesPage } from '@/lib/service-pages'
import type { WebsiteSchema } from '@/lib/website-schema'

type DemoLang = 'tr' | 'en'
type ServicesSection = Extract<WebsiteSchema['sections'][number], { type: 'services' }>
type ServiceItem = ServicesSection['items'][number]

const FEATURES_HEADING: Record<DemoLang, string> = {
  tr: 'Hizmete neler dahil',
  en: 'What is included',
}

const CONTACT_HEADING: Record<DemoLang, string> = {
  tr: 'Nasıl çalışıyoruz',
  en: 'How we work',
}

const CONTACT_BODY: Record<DemoLang, string> = {
  tr: 'İhtiyacınızı dinliyor, size özel bir plan hazırlıyor ve süreci baştan sona birlikte yürütüyoruz. Detaylar için iletişim sayfamızdan bize ulaşabilirsiniz.',
  en: 'We listen to what you need, prepare a plan for you and run the process with you from start to finish. Reach out through our contact page for details.',
}

function toServiceItem(service: CatalogItem, lang: DemoLang): ServiceItem {
  const name = service.name[lang]
  const blocks: NonNullable<ServiceItem['detail']> = [
    { heading: name, level: 'h2', body: service.description[lang] },
  ]
  if (service.features.length > 0) {
    blocks.push({
      heading: FEATURES_HEADING[lang],
      level: 'h2',
      body: service.features.map((feature) => `- ${feature[lang]}`).join('\n'),
    })
  }
  blocks.push({ heading: CONTACT_HEADING[lang], level: 'h2', body: CONTACT_BODY[lang] })
  return {
    title: name,
    description: service.short[lang],
    slug: service.slug,
    src: service.image,
    alt: name,
    detail: blocks,
    pageEnabled: true,
    // Demo copy is written for the example brand, so it carries the sample flag
    // (demos render it as-is; a published customer site would need approval).
    sample: true,
  }
}

/**
 * Gives a showcase demo its services list page and one page per service,
 * built from the demo's own catalog (nothing is generated). Mutates `site`.
 */
export function applyDemoServices(site: WebsiteSchema, slug: string, lang: DemoLang): void {
  const catalog = getCatalog(slug)
  if (!catalog || catalog.services.length < 2) return

  const items = catalog.services.slice(0, 8).map((service) => toServiceItem(service, lang))
  const detail = { pageEnabled: true, linkEnabled: true }
  const existing = site.sections.findIndex((s) => s.type === 'services')

  if (existing >= 0) {
    const current = site.sections[existing] as ServicesSection
    site.sections = site.sections.map((section, i) => (i === existing ? { ...current, items, detail } : section))
  } else {
    const section: ServicesSection = { type: 'services', title: catalog.servicesLabel[lang], items, detail }
    const anchor = site.sections.findIndex((s) => s.type === 'contact' || s.type === 'footer')
    const at = anchor >= 0 ? anchor : site.sections.length
    site.sections = [...site.sections.slice(0, at), section, ...site.sections.slice(at)]
  }

  const synced = syncServicesPage(site)
  site.pages = synced.pages
  site.sections = synced.sections
}
