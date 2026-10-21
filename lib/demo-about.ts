import type { Section, WebsiteSchema } from '@/lib/website-schema'
import {
  MAX_ABOUT_IMAGES,
  collectReusableImages,
  layoutAvailability,
  type AboutLayout,
  type AboutMedia,
} from '@/lib/about-media'
import { buildStarterAboutDetail, findAboutSection, syncDetailPages } from '@/lib/section-detail'

type Lang = 'tr' | 'en'
type Copy = { tr: string; en: string }
type AboutCopy = { title: Copy; body: Copy; highlights: { tr: string[]; en: string[] } }

/** Layout each of the 8 showcase demos uses for its about section. */
export const DEMO_ABOUT_LAYOUT: Record<string, AboutLayout> = {
  kahve: 'collage',
  restoran: 'collage',
  eticaret: 'collage',
  'dis-klinigi': 'round',
  guzellik: 'round',
  mimarlik: 'corner',
  emlak: 'corner',
  hukuk: 'figure',
}

/**
 * Illustrative figures for demos that use the figure layout. They are flagged
 * `sample`, so the publish gate lists them until the owner confirms or edits.
 */
const DEMO_ABOUT_FIGURE: Record<string, { value: string; label: Copy }> = {
  hukuk: { value: '1998', label: { tr: 'Kuruluş yılı', en: 'Founded' } },
}

/** About copy for demos whose generated site has no about section of its own. */
const MISSING_ABOUT_COPY: Record<string, AboutCopy> = {
  hukuk: {
    title: { tr: 'Hakkımızda', en: 'About us' },
    body: {
      tr: 'Dosyanızı baştan sona aynı ekip yürütür. Süreci açık bir dille anlatır, her aşamada sizi bilgilendiririz.',
      en: 'The same team handles your file from start to finish. We explain the process plainly and keep you informed at every stage.',
    },
    highlights: {
      tr: ['İlk görüşmede net yol haritası', 'Düzenli ve yazılı bilgilendirme', 'Gizlilik esaslı çalışma'],
      en: ['A clear roadmap at the first meeting', 'Regular written updates', 'Confidentiality first'],
    },
  },
  mimarlik: {
    title: { tr: 'Stüdyomuz', en: 'Our studio' },
    body: {
      tr: 'Her projeye alanı, ışığı ve kullanıcıyı dinleyerek başlarız. Fikirden şantiyeye aynı masada çalışırız.',
      en: 'We start every project by listening to the site, the light and the people who will use it, and stay with it from idea to site.',
    },
    highlights: {
      tr: ['Konsept ve uygulama projesi', 'Şantiye koordinasyonu', 'Malzeme ve detay odağı'],
      en: ['Concept and construction drawings', 'Site coordination', 'Focus on materials and detail'],
    },
  },
  'dis-klinigi': {
    title: { tr: 'Kliniğimiz', en: 'Our clinic' },
    body: {
      tr: 'Sakin bir ortamda, tedavinin her adımını önceden anlatarak çalışırız. Amacımız rahat ve sağlıklı bir gülüş.',
      en: 'We work in a calm setting and explain each step of treatment beforehand. Our aim is a comfortable, healthy smile.',
    },
    highlights: {
      tr: ['Ağrısız tedavi yaklaşımı', 'Hijyen ve sterilizasyon', 'Kişiye özel tedavi planı'],
      en: ['Gentle, pain-conscious care', 'Strict hygiene and sterilisation', 'A treatment plan made for you'],
    },
  },
  guzellik: {
    title: { tr: 'Salonumuz', en: 'Our salon' },
    body: {
      tr: 'Size ayrılmış zamanı önemseriz. Cildinize ve saçınıza uygun ürünlerle, acele etmeden çalışırız.',
      en: 'We value the time set aside for you. We work without rushing, with products suited to your skin and hair.',
    },
    highlights: {
      tr: ['Randevulu, sakin ortam', 'Cilt ve saç tipine göre bakım', 'Seçilmiş profesyonel ürünler'],
      en: ['Calm, by-appointment setting', 'Care matched to skin and hair type', 'Carefully chosen professional products'],
    },
  },
  eticaret: {
    title: { tr: 'Hakkımızda', en: 'About us' },
    body: {
      tr: 'Ürünleri tek tek seçer, hızlı gönderir ve satış sonrasında da yanınızda oluruz.',
      en: 'We pick products one by one, ship quickly and stay with you after the sale.',
    },
    highlights: {
      tr: ['Özenle seçilmiş ürünler', 'Hızlı kargo', 'Kolay iade'],
      en: ['Carefully selected products', 'Fast shipping', 'Easy returns'],
    },
  },
}

function insertAbout(sections: Section[], slug: string, lang: Lang): Section[] {
  if (sections.some((s) => s.type === 'about')) return sections
  const copy = MISSING_ABOUT_COPY[slug]
  if (!copy) return sections
  const about: Section = {
    type: 'about',
    title: copy.title[lang],
    body: copy.body[lang],
    highlights: copy.highlights[lang],
  }
  const next = [...sections]
  const at = next.findIndex((s) => s.type === 'contact')
  next.splice(at === -1 ? Math.max(0, next.length - 1) : at, 0, about)
  return next
}

/**
 * Gives a showcase demo its about section and the layout designed for it.
 * Reuses the demo's own canonical images (nothing is generated); when a demo
 * has no image to show, the about section stays text-led. Mutates `site`.
 */
export function applyDemoAbout(site: WebsiteSchema, slug: string, lang: Lang): void {
  const layout = DEMO_ABOUT_LAYOUT[slug]
  if (!layout) return
  site.sections = insertAbout(site.sections, slug, lang)

  const images = collectReusableImages(site)
    .slice(0, MAX_ABOUT_IMAGES)
    .map((image) => ({ src: image.src, alt: image.alt, origin: 'reused' }))
  const sample = DEMO_ABOUT_FIGURE[slug]
  const figure: AboutMedia['figure'] = sample
    ? { value: sample.value, label: sample.label[lang], sample: true }
    : undefined
  const hasContact = site.sections.some((s) => s.type === 'contact' && !s.hidden)

  site.sections = site.sections.map((section) => {
    if (section.type !== 'about' || section.media) return section
    const available = layoutAvailability(layout, images.length, figure).available
    const media: AboutMedia = {
      enabled: images.length > 0,
      layout: available ? layout : 'corner',
      images,
      label: lang === 'tr' ? 'Biz kimiz' : 'Who we are',
      figure: available ? figure : undefined,
      cta: hasContact ? { label: lang === 'tr' ? 'İletişime geçin' : 'Get in touch', href: '#contact' } : undefined,
    }
    return { ...section, media }
  })

  // Demo about copy is the demo's own content, so its long page is shown
  // (not flagged as an unapproved sample) and reachable at /demo/<slug>/hakkimizda.
  const about = findAboutSection(site)
  if (about && !about.detail) {
    const detail = { ...buildStarterAboutDetail(site, about), sample: false }
    site.sections = site.sections.map((section) => (section === about ? { ...about, detail } : section))
  }
  const synced = syncDetailPages(site)
  site.pages = synced.pages
}
