import { ANNOUNCEMENT_SAMPLE_HINT } from '@/lib/announcement'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

/**
 * Demo-only announcement band. Reuses the regular `announcement` section (marquee
 * speed, link validation, `sample` flag, movable position); only the copy and the
 * placement are decided here. Real, AI-generated customer sites never get one
 * automatically.
 *
 * Copy rules: general, fixed, non-misleading sentences only. No discount rates,
 * prices, campaign dates, "last N items", awards or review claims.
 */

type Bilingual = { tr: readonly string[]; en: readonly string[] }

export const DEMO_ANNOUNCEMENT_POOLS: Record<string, Bilingual> = {
  kahve: {
    tr: [
      'Yeni menümüzü denemek için bizi ziyaret edin.',
      'Masanızı ayırtmak için WhatsApp’tan ulaşın.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
      'Özel kahve çekirdeklerimiz hakkında sorularınızı bize iletin.',
      'Yeni demleme seçeneklerimizi tezgâhta keşfedin.',
    ],
    en: [
      'Visit us to try our new menu.',
      'Reach us on WhatsApp to reserve your table.',
      'See our contact page for opening hours.',
      'Send us your questions about our specialty beans.',
      'Discover our new brewing options at the counter.',
    ],
  },
  mimarlik: {
    tr: [
      'Bu hafta keşif görüşmesi için randevu alın.',
      'Projeniz için ücretsiz ön görüşme talep edin.',
      'Yeni projelerimizi portföy bölümünde inceleyin.',
      'Fikrinizi anlatın, size WhatsApp’tan dönelim.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
    ],
    en: [
      'Book a discovery meeting this week.',
      'Request a free introductory call for your project.',
      'Browse our latest projects in the portfolio.',
      'Tell us your idea and we will reply on WhatsApp.',
      'See our contact page for working hours.',
    ],
  },
  'dis-klinigi': {
    tr: [
      'Muayene randevusu için bizi arayın veya WhatsApp’tan yazın.',
      'Tedaviniz hakkında sorularınız için danışma talep edin.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
      'Yeni randevularımız için hemen formu doldurun.',
      'Ağız ve diş sağlığınız için kontrol randevusu alın.',
    ],
    en: [
      'Call us or message on WhatsApp to book an appointment.',
      'Request a consultation about your treatment.',
      'See our contact page for opening hours.',
      'Fill in the form now to book your appointment.',
      'Book a check-up for your oral health.',
    ],
  },
  emlak: {
    tr: [
      'Yeni ilanlarımızı incelemek için ilanlar bölümüne göz atın.',
      'Mülkünüz için ücretsiz değerleme talep edin.',
      'Gezmek istediğiniz ev için randevu alın.',
      'Aradığınız özellikleri WhatsApp’tan bize yazın.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
    ],
    en: [
      'Browse our new listings in the listings section.',
      'Request a free valuation for your property.',
      'Book a viewing for the home you want to see.',
      'Message us the features you are looking for on WhatsApp.',
      'See our contact page for opening hours.',
    ],
  },
  guzellik: {
    tr: [
      'Randevunuzu şimdi oluşturun, size uygun saati birlikte seçelim.',
      'Cilt ve bakım ihtiyaçlarınız için ücretsiz danışma talep edin.',
      'Yeni hizmetlerimizi hizmetler bölümünde keşfedin.',
      'Randevu için WhatsApp’tan ulaşın.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
    ],
    en: [
      'Book your appointment now and we will pick a time that suits you.',
      'Request a free consultation about your skin and care needs.',
      'Discover our new services in the services section.',
      'Reach us on WhatsApp to book.',
      'See our contact page for opening hours.',
    ],
  },
  hukuk: {
    tr: [
      'İlk görüşme için randevu alın.',
      'Hukuki sorunuz için danışma talep edin.',
      'Uzmanlık alanlarımızı hizmetler bölümünde inceleyin.',
      'Dosyanızı kısaca anlatın, WhatsApp’tan size dönelim.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
    ],
    en: [
      'Book an appointment for a first meeting.',
      'Request a consultation for your legal question.',
      'See our practice areas in the services section.',
      'Briefly describe your case and we will reply on WhatsApp.',
      'See our contact page for working hours.',
    ],
  },
  restoran: {
    tr: [
      'Yeni menümüzü keşfedin, masanızı şimdi ayırtın.',
      'Rezervasyon için WhatsApp’tan ulaşın.',
      'Çalışma saatlerimiz için iletişim sayfamıza göz atın.',
      'Özel günleriniz için masa talebinizi bize iletin.',
      'Günün lezzetleri için bizi ziyaret edin.',
    ],
    en: [
      'Discover our new menu and reserve your table now.',
      'Reach us on WhatsApp to reserve.',
      'See our contact page for opening hours.',
      'Send us your table request for special occasions.',
      'Visit us for the dishes of the day.',
    ],
  },
  eticaret: {
    tr: [
      'Yeni ürünlerimizi keşfedin.',
      'Sorularınız için WhatsApp’tan bize ulaşın.',
      'Sipariş ve teslimat bilgileri için iletişim sayfamıza göz atın.',
      'Aradığınız ürünü bulamadıysanız bize yazın.',
      'Yeni gelen ürünler için mağazayı düzenli ziyaret edin.',
    ],
    en: [
      'Discover our new products.',
      'Reach us on WhatsApp with any questions.',
      'See our contact page for order and delivery information.',
      'Can’t find the product you want? Write to us.',
      'Visit the store regularly for new arrivals.',
    ],
  },
}

/** Stable 32-bit FNV-1a hash; the same slug always yields the same value (no Math.random, no hydration drift). */
function hashSlug(slug: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < slug.length; i++) {
    hash ^= slug.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The demo's example sentence, picked from its sector pool by demo id. Same index in both languages. */
export function pickDemoAnnouncementSentence(slug: string, lang: 'tr' | 'en'): string | null {
  const pool = DEMO_ANNOUNCEMENT_POOLS[slug]
  if (!pool) return null
  const sentences = pool[lang]
  return sentences[hashSlug(slug) % sentences.length]
}

/** Full band text: the example sentence plus the fixed hint. */
export function demoAnnouncementText(slug: string, lang: 'tr' | 'en'): string | null {
  const sentence = pickDemoAnnouncementSentence(slug, lang)
  return sentence ? `${sentence} ${ANNOUNCEMENT_SAMPLE_HINT[lang]}` : null
}

/**
 * Where the band goes in the home list. Demos with a slider under the header
 * (a hero with slides, or a standalone slider) get it right below that slider
 * run; all others get it first, above the header.
 */
export function demoAnnouncementIndex(sections: readonly Section[]): number {
  const hasSlider = sections.some((s) => s.type === 'slider' || (s.type === 'hero' && (s.slides?.length ?? 0) > 0))
  if (!hasSlider) return 0
  let index = 0
  while (index < sections.length && (sections[index].type === 'hero' || sections[index].type === 'slider')) index++
  return index
}

/**
 * Adds the sample announcement band to a demo site, in place. The band never
 * counts toward the section cap, so it cannot push a demo over its limit.
 */
export function addDemoAnnouncement(
  site: WebsiteSchema,
  slug: string,
  lang: 'tr' | 'en',
  link?: string,
): void {
  const text = demoAnnouncementText(slug, lang)
  if (!text) return
  if (site.sections.some((s) => s.type === 'announcement')) return
  site.sections.splice(demoAnnouncementIndex(site.sections), 0, {
    type: 'announcement',
    items: [{ text, ...(link ? { link } : {}), sample: true }],
    sample: true,
    speed: 'normal',
    pauseOnHover: true,
    dismissible: false,
  })
}
