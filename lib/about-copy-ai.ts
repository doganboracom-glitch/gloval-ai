import { z } from 'zod'
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { collectAboutFacts, hasEnoughFacts } from '@/lib/about-detail-ai'
import {
  ABOUT_COPY_FIELDS,
  CARD_TEXT_MAX_SENTENCES,
  LONG_TEXT_MAX_SENTENCES,
  SHORT_TEXT_MAX_SENTENCES,
  groundText,
  hasAboutCopy,
  type AboutCopy,
} from '@/lib/about-copy'
import { findAboutSection } from '@/lib/section-detail'

type Lang = 'tr' | 'en'

const outputSchema = z.object({
  shortText: z.string().min(20).max(700),
  longText: z.string().min(40).max(1600),
  vision: z.string().min(10).max(500),
  mission: z.string().min(10).max(500),
})

const SYSTEM: Record<Lang, string> = {
  tr:
    'Bir web sitesinin "Hakkımızda" metinlerini yazıyorsun. SADECE verilen bilgileri kullan. ' +
    'Sayı, yıl, rakam, ödül, sertifika, müşteri sayısı, kuruluş yılı, konum veya ekip üyesi ismi UYDURMA; emin olmadığın bilgiyi yazma, genel ve kısa kal. ' +
    'Yer tutucu, lorem ipsum ve köşeli parantez kullanma. Doğal, akıcı Türkçe; birinci çoğul şahıs. ' +
    'shortText: EN FAZLA 3 cümle. longText: tam 4 cümle, shortText\'i tekrar etmeyen ek paragraf. vision: 1-2 cümle. mission: 1-2 cümle.',
  en:
    'You write the "About us" copy for a website. Use ONLY the facts provided. ' +
    'NEVER invent numbers, years, awards, certificates, client counts, founding years, locations or team member names; if unsure, leave it out and stay general and short. ' +
    'No placeholders, lorem ipsum or square brackets. Natural, fluent first-person-plural English. ' +
    'shortText: AT MOST 3 sentences. longText: exactly 4 sentences, an extra paragraph that does not repeat shortText. vision: 1-2 sentences. mission: 1-2 sentences.',
}

/**
 * Pure guard shared with tests: grounds each field against the site's own
 * facts and returns only what survives. `null` when the home teaser did not
 * survive, so the site then keeps its legacy About section untouched.
 */
export function groundAboutCopy(raw: AboutCopy, facts: string[]): AboutCopy | null {
  const allowed = facts.join(' ')
  const limits = {
    shortText: SHORT_TEXT_MAX_SENTENCES,
    longText: LONG_TEXT_MAX_SENTENCES,
    vision: CARD_TEXT_MAX_SENTENCES,
    mission: CARD_TEXT_MAX_SENTENCES,
  } as const
  const out: AboutCopy = {}
  for (const field of ABOUT_COPY_FIELDS) {
    const value = groundText(raw[field] ?? '', { allowed }, limits[field])
    if (value) out[field] = value
  }
  return out.shortText ? out : null
}

/** Applies generated copy to the about section, never overwriting owner text. */
export function seedAboutCopy<T extends { sections: Section[] }>(site: T, copy: AboutCopy | null | undefined): T {
  if (!copy) return site
  const about = findAboutSection(site as unknown as Pick<WebsiteSchema, 'sections'>)
  if (!about || hasAboutCopy(about)) return site
  return { ...site, sections: site.sections.map((s) => (s === about ? { ...about, ...copy } : s)) }
}

export async function generateAboutCopy(site: WebsiteSchema, planCode: string | null): Promise<AboutCopy | null> {
  if (!findAboutSection(site) || !hasEnoughFacts(site)) return null
  const lang: Lang = site.meta.language === 'en' ? 'en' : 'tr'
  const facts = collectAboutFacts(site)
  try {
    const result = await generateStructured({
      ai: resolveAiModel('sectionEdit', planCode),
      schema: outputSchema,
      system: SYSTEM[lang],
      prompt: [
        `Business: ${site.meta.name}`,
        'Facts (the only allowed source):',
        ...facts.map((f) => `- ${f}`),
      ].join('\n'),
      recordEvent: false,
    })
    return groundAboutCopy(result.object, [site.meta.name, ...facts])
  } catch (err) {
    console.log('[v0] about-copy generation failed:', err instanceof Error ? err.message : err)
    return null
  }
}
