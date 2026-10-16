import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { uniquePageSlug } from '@/lib/page-slugs'
import type { Sector } from '@/lib/sector-profiles'
import { formatPrice } from '@/lib/format'

/**
 * Info-page templates (FAQ, About, Shipping, Payment, Returns summary).
 *
 * These are plain-language summaries, NOT legal documents (those live under
 * the separate legal-docs flow). Hard rule: a template never invents a fact.
 * Anything that is a number, duration, fee or accepted payment method is either
 * read from the store settings / the owner's input, or left as a `sample: true`
 * placeholder that the publish gate catches and the public render strips.
 */

export const INFO_TEMPLATE_IDS = ['faq', 'about', 'shipping', 'payment', 'returns'] as const
export type InfoTemplateId = (typeof INFO_TEMPLATE_IDS)[number]

export type InfoLang = 'tr' | 'en'

/** Store facts the owner has actually configured. `null` = not configured. */
export type StoreFacts = {
  shipping: {
    feeCents: number
    freeThresholdCents: number | null
    deliveryNote: string | null
    carrierName: string | null
  } | null
  payment: {
    cardEnabled: boolean
    bankEnabled: boolean
    codEnabled: boolean
    codFeeCents: number
  } | null
}

export type InfoPageDraft = {
  template: InfoTemplateId
  title: string
  slug: string
  sections: Section[]
  seo: { title: string; description: string }
  /** Number of placeholder items the owner still has to fill in. */
  placeholders: number
}

/** Templates whose content can come from the store settings. */
export const STORE_FED_TEMPLATES: readonly InfoTemplateId[] = ['shipping', 'payment']

const TITLES: Record<InfoLang, Record<InfoTemplateId, string>> = {
  tr: {
    faq: 'Sık Sorulan Sorular',
    about: 'Hakkımızda',
    shipping: 'Kargo ve Teslimat',
    payment: 'Ödeme Seçenekleri',
    returns: 'İade ve Değişim',
  },
  en: {
    faq: 'Frequently Asked Questions',
    about: 'About Us',
    shipping: 'Shipping and Delivery',
    payment: 'Payment Options',
    returns: 'Returns and Exchanges',
  },
}

const DESCRIPTIONS: Record<InfoLang, Record<InfoTemplateId, string>> = {
  tr: {
    faq: 'Sıkça sorulan sorular ve yanıtları.',
    about: 'Biz kimiz, ne yapıyoruz ve nasıl çalışıyoruz.',
    shipping: 'Siparişlerin nasıl gönderildiği ve teslim edildiği hakkında bilgi.',
    payment: 'Kabul edilen ödeme yöntemleri hakkında bilgi.',
    returns: 'İade ve değişim sürecinin kısa özeti.',
  },
  en: {
    faq: 'Frequently asked questions and answers.',
    about: 'Who we are, what we do and how we work.',
    shipping: 'How orders are shipped and delivered.',
    payment: 'Information about accepted payment methods.',
    returns: 'A short summary of the returns and exchange process.',
  },
}

/** Sector wording for the generic parts of the drafts (no facts, only nouns). */
const SECTOR_NOUN: Record<InfoLang, Record<string, string>> = {
  tr: {
    food: 'mutfağımız',
    law: 'hukuki destek',
    architecture: 'mimarlık projeleri',
    beauty: 'güzellik ve bakım hizmetleri',
    tech: 'teknoloji çözümleri',
    ecommerce: 'ürünlerimiz',
    photography: 'fotoğraf çekimleri',
    automotive: 'araç hizmetleri',
    realestate: 'gayrimenkul danışmanlığı',
    default: 'hizmetlerimiz',
  },
  en: {
    food: 'our kitchen',
    law: 'legal support',
    architecture: 'architecture projects',
    beauty: 'beauty and care services',
    tech: 'technology solutions',
    ecommerce: 'our products',
    photography: 'photo sessions',
    automotive: 'vehicle services',
    realestate: 'real-estate advisory',
    default: 'our services',
  },
}

type FaqItem = { question: string; answer: string; sample?: boolean }

const PLACEHOLDER: Record<InfoLang, string> = {
  tr: 'Bu bilgiyi kendi işletmenize göre yazın.',
  en: 'Write this information for your own business.',
}

function placeholder(lang: InfoLang, question: string): FaqItem {
  return { question, answer: PLACEHOLDER[lang], sample: true }
}

function faqSection(title: string, items: FaqItem[]): Section {
  return { type: 'faq', title, items } as Section
}

function buildFaq(lang: InfoLang, noun: string): FaqItem[] {
  return lang === 'tr'
    ? [
        {
          question: 'Bize nasıl ulaşabilirim?',
          answer: 'İletişim sayfamızdaki bilgilerden ve formdan bize ulaşabilirsiniz.',
        },
        {
          question: `${capitalize(noun, lang)} hakkında nasıl bilgi alabilirim?`,
          answer: 'İletişim formunu doldurun; sorularınızı yanıtlamaktan memnuniyet duyarız.',
        },
        placeholder(lang, 'Çalışma saatleriniz nedir?'),
        placeholder(lang, 'Hangi bölgelere hizmet veriyorsunuz?'),
      ]
    : [
        {
          question: 'How can I contact you?',
          answer: 'You can reach us through the details and the form on our contact page.',
        },
        {
          question: `How can I learn more about ${noun}?`,
          answer: 'Fill in the contact form and we will be happy to answer your questions.',
        },
        placeholder(lang, 'What are your working hours?'),
        placeholder(lang, 'Which areas do you serve?'),
      ]
}

function capitalize(text: string, lang: InfoLang): string {
  if (!text) return text
  return text.charAt(0).toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US') + text.slice(1)
}

function buildShipping(lang: InfoLang, facts: StoreFacts['shipping']): FaqItem[] {
  const tr = lang === 'tr'
  const feeQ = tr ? 'Kargo ücreti nedir?' : 'What is the shipping fee?'
  const timeQ = tr ? 'Teslimat ne kadar sürer?' : 'How long does delivery take?'
  const carrierQ = tr ? 'Hangi kargo firmasıyla gönderiyorsunuz?' : 'Which carrier do you use?'
  const trackQ = tr ? 'Siparişimi nasıl takip ederim?' : 'How do I track my order?'

  const items: FaqItem[] = []

  if (facts) {
    const feeText =
      facts.feeCents <= 0
        ? tr
          ? 'Kargo ücretsizdir.'
          : 'Shipping is free.'
        : tr
          ? `Kargo ücreti ${formatPrice(facts.feeCents)}.`
          : `The shipping fee is ${formatPrice(facts.feeCents)}.`
    const thresholdText =
      facts.freeThresholdCents != null && facts.feeCents > 0
        ? tr
          ? ` ${formatPrice(facts.freeThresholdCents)} ve üzeri siparişlerde kargo ücretsizdir.`
          : ` Orders of ${formatPrice(facts.freeThresholdCents)} or more ship for free.`
        : ''
    items.push({ question: feeQ, answer: `${feeText}${thresholdText}` })
    items.push(
      facts.deliveryNote
        ? { question: timeQ, answer: facts.deliveryNote }
        : placeholder(lang, timeQ),
    )
    items.push(
      facts.carrierName
        ? {
            question: carrierQ,
            answer: tr ? `Siparişler ${facts.carrierName} ile gönderilir.` : `Orders ship with ${facts.carrierName}.`,
          }
        : placeholder(lang, carrierQ),
    )
  } else {
    items.push(placeholder(lang, feeQ), placeholder(lang, timeQ), placeholder(lang, carrierQ))
  }

  items.push({
    question: trackQ,
    answer: tr
      ? 'Siparişiniz gönderildiğinde e-posta ile bilgilendirilirsiniz.'
      : 'You will be notified by e-mail once your order has shipped.',
  })
  return items
}

function buildPayment(lang: InfoLang, facts: StoreFacts['payment']): FaqItem[] {
  const tr = lang === 'tr'
  if (!facts) {
    return [
      placeholder(lang, tr ? 'Hangi ödeme yöntemlerini kabul ediyorsunuz?' : 'Which payment methods do you accept?'),
      placeholder(lang, tr ? 'Ödemeler güvenli mi?' : 'Are payments secure?'),
    ]
  }
  const items: FaqItem[] = []
  if (facts.cardEnabled) {
    items.push({
      question: tr ? 'Kartla ödeme yapabilir miyim?' : 'Can I pay by card?',
      answer: tr
        ? 'Evet, kredi veya banka kartıyla ödeme yapabilirsiniz. Kart bilgileriniz ödeme sağlayıcısı üzerinden işlenir.'
        : 'Yes, you can pay with a credit or debit card. Card details are processed by the payment provider.',
    })
  }
  if (facts.bankEnabled) {
    items.push({
      question: tr ? 'Havale / EFT ile ödeyebilir miyim?' : 'Can I pay by bank transfer?',
      answer: tr
        ? 'Evet, ödeme adımında banka bilgilerimiz gösterilir.'
        : 'Yes, our bank details are shown at the payment step.',
    })
  }
  if (facts.codEnabled) {
    items.push({
      question: tr ? 'Kapıda ödeme var mı?' : 'Is cash on delivery available?',
      answer:
        facts.codFeeCents > 0
          ? tr
            ? `Evet, kapıda ödeme seçeneği vardır. Kapıda ödeme bedeli ${formatPrice(facts.codFeeCents)}.`
            : `Yes. The cash-on-delivery fee is ${formatPrice(facts.codFeeCents)}.`
          : tr
            ? 'Evet, kapıda ödeme seçeneği vardır.'
            : 'Yes, cash on delivery is available.',
    })
  }
  if (items.length === 0) {
    return [placeholder(lang, tr ? 'Hangi ödeme yöntemlerini kabul ediyorsunuz?' : 'Which payment methods do you accept?')]
  }
  return items
}

function buildReturns(lang: InfoLang): FaqItem[] {
  return lang === 'tr'
    ? [
        placeholder(lang, 'İade süresi ne kadardır?'),
        placeholder(lang, 'İade veya değişim nasıl başlatılır?'),
        placeholder(lang, 'İade kargo ücretini kim öder?'),
        {
          question: 'Bu sayfa yasal metin midir?',
          answer: 'Hayır. Bu sayfa kısa bir özettir; resmi iade ve cayma koşulları yasal sayfalarda yer alır.',
        },
      ]
    : [
        placeholder(lang, 'How long is the return period?'),
        placeholder(lang, 'How do I start a return or exchange?'),
        placeholder(lang, 'Who pays for return shipping?'),
        {
          question: 'Is this page a legal document?',
          answer: 'No. This is a short summary; the official return terms are on the legal pages.',
        },
      ]
}

function buildAbout(lang: InfoLang, noun: string, siteName: string): Section {
  const name = siteName.trim()
  return lang === 'tr'
    ? ({
        type: 'about',
        title: 'Hakkımızda',
        body: `${name ? `${name} olarak ` : ''}${noun} konusunda müşterilerimize yardımcı olmak için buradayız. Hikayenizi, çalışma şeklinizi ve değerlerinizi bu alana kendi sözlerinizle ekleyin.`,
        highlights: [],
        sample: true,
      } as Section)
    : ({
        type: 'about',
        title: 'About Us',
        body: `${name ? `At ${name}, we` : 'We'} are here to help customers with ${noun}. Add your story, way of working and values here in your own words.`,
        highlights: [],
        sample: true,
      } as Section)
}

export function buildInfoPage(input: {
  template: InfoTemplateId
  lang: InfoLang
  sector: Sector
  siteName?: string
  store?: StoreFacts | null
  existingSlugs: readonly string[]
}): InfoPageDraft {
  const { template, lang, sector } = input
  const noun = SECTOR_NOUN[lang][sector] ?? SECTOR_NOUN[lang].default
  const title = TITLES[lang][template]

  let sections: Section[]
  let items: FaqItem[] = []

  switch (template) {
    case 'about':
      sections = [buildAbout(lang, noun, input.siteName ?? '')]
      break
    case 'shipping':
      items = buildShipping(lang, input.store?.shipping ?? null)
      sections = [faqSection(title, items)]
      break
    case 'payment':
      items = buildPayment(lang, input.store?.payment ?? null)
      sections = [faqSection(title, items)]
      break
    case 'returns':
      items = buildReturns(lang)
      sections = [faqSection(title, items)]
      break
    default:
      items = buildFaq(lang, noun)
      sections = [faqSection(title, items)]
  }

  // The FAQ schema needs at least two items; pad with a placeholder, never a fact.
  for (const section of sections) {
    if (section.type === 'faq' && section.items.length < 2) {
      section.items.push(placeholder(lang, lang === 'tr' ? 'Başka sorunuz mu var?' : 'Have another question?'))
    }
  }

  const placeholders =
    sections.reduce((n, s) => {
      if (s.type === 'faq') return n + s.items.filter((i) => i.sample).length
      return n + (s.sample ? 1 : 0)
    }, 0)

  return {
    template,
    title,
    slug: uniquePageSlug(title, input.existingSlugs),
    sections,
    seo: { title, description: DESCRIPTIONS[lang][template] },
    placeholders,
  }
}

/** Writes a draft onto the site as a real `info` page (no plan check here). */
export function addInfoPageToSite(site: WebsiteSchema, draft: InfoPageDraft): WebsiteSchema {
  const next = structuredClone(site)
  next.pages.push({
    slug: draft.slug,
    title: draft.title,
    kind: 'info',
    sections: draft.sections,
    seo: draft.seo,
  })
  return next
}
