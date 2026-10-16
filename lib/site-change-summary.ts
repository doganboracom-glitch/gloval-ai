import type { SectionType, WebsiteSchema } from '@/lib/website-schema'
import { SECTION_LABEL } from '@/lib/website-command-parser'

/**
 * Describes what really differs between two versions of a site, in plain
 * language. Used to show the owner exactly what an AI edit changed (and to
 * refuse edits that touch far more than the instruction asked for), instead of
 * a generic "I updated your site".
 */

type Lang = 'tr' | 'en'

export type SiteChangeSummary = {
  lines: string[]
  /** Sections added, removed, or whose content changed. */
  sectionsTouched: number
}

const say = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const quote = (labels: string[]) => labels.map((l) => `"${l}"`).join(', ')

function sectionLabel(type: SectionType, lang: Lang): string {
  return SECTION_LABEL[type][lang]
}

function menuLabels(site: WebsiteSchema): string[] {
  return site.pages.length > 1 ? site.pages.map((p) => p.title) : site.navigation.links.map((l) => l.label)
}

function withoutHidden<T extends object>(section: T): Omit<T, 'hidden'> {
  const { hidden: _hidden, ...rest } = section as T & { hidden?: boolean }
  return rest
}

function typeCounts(sections: WebsiteSchema['sections']): Map<SectionType, number> {
  const counts = new Map<SectionType, number>()
  for (const s of sections) counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
  return counts
}

export function summarizeSiteChanges(before: WebsiteSchema, after: WebsiteSchema, lang: Lang): SiteChangeSummary {
  const lines: string[] = []
  let sectionsTouched = 0

  if (before.meta.name !== after.meta.name) {
    lines.push(say(lang, `Site adı: "${before.meta.name}" -> "${after.meta.name}"`, `Site name: "${before.meta.name}" -> "${after.meta.name}"`))
  }
  if (before.meta.tagline !== after.meta.tagline) lines.push(say(lang, 'Slogan güncellendi', 'Tagline updated'))
  if (before.meta.seoTitle !== after.meta.seoTitle) lines.push(say(lang, 'SEO başlığı güncellendi', 'SEO title updated'))
  if (before.meta.language !== after.meta.language) {
    lines.push(say(lang, `Site dili: ${before.meta.language} -> ${after.meta.language}`, `Site language: ${before.meta.language} -> ${after.meta.language}`))
  }
  if (!same(before.theme.palette, after.theme.palette)) lines.push(say(lang, 'Renk paleti değişti', 'Color palette changed'))
  if (before.theme.mode !== after.theme.mode) lines.push(say(lang, 'Tema modu değişti', 'Theme mode changed'))
  if (before.theme.radius !== after.theme.radius) lines.push(say(lang, 'Köşe yuvarlaklığı değişti', 'Corner radius changed'))

  const beforeMenu = menuLabels(before)
  const afterMenu = menuLabels(after)
  const addedMenu = afterMenu.filter((l) => !beforeMenu.includes(l))
  const removedMenu = beforeMenu.filter((l) => !afterMenu.includes(l))
  if (addedMenu.length) lines.push(say(lang, `Menüye eklendi: ${quote(addedMenu)}`, `Added to the menu: ${quote(addedMenu)}`))
  if (removedMenu.length) lines.push(say(lang, `Menüden kaldırıldı: ${quote(removedMenu)}`, `Removed from the menu: ${quote(removedMenu)}`))
  if (before.navigation.logoText !== after.navigation.logoText) {
    lines.push(say(lang, 'Logo yazısı güncellendi', 'Logo text updated'))
  }

  const beforeCounts = typeCounts(before.sections)
  const afterCounts = typeCounts(after.sections)
  const added: string[] = []
  const removed: string[] = []
  const types = new Set<SectionType>([...beforeCounts.keys(), ...afterCounts.keys()])
  for (const type of types) {
    const diff = (afterCounts.get(type) ?? 0) - (beforeCounts.get(type) ?? 0)
    for (let i = 0; i < Math.abs(diff); i++) (diff > 0 ? added : removed).push(sectionLabel(type, lang))
  }
  sectionsTouched += added.length + removed.length
  if (added.length) lines.push(say(lang, `Bölüm eklendi: ${quote(added)}`, `Section added: ${quote(added)}`))
  if (removed.length) lines.push(say(lang, `Bölüm kaldırıldı: ${quote(removed)}`, `Section removed: ${quote(removed)}`))

  const hid: string[] = []
  const showed: string[] = []
  const edited: string[] = []
  const seen = new Map<SectionType, number>()
  const beforeByType = new Map<SectionType, WebsiteSchema['sections']>()
  for (const s of before.sections) beforeByType.set(s.type, [...(beforeByType.get(s.type) ?? []), s])
  for (const next of after.sections) {
    const k = seen.get(next.type) ?? 0
    seen.set(next.type, k + 1)
    const prev = beforeByType.get(next.type)?.[k]
    if (!prev) continue
    const label = sectionLabel(next.type, lang)
    if (Boolean(prev.hidden) !== Boolean(next.hidden)) (next.hidden ? hid : showed).push(label)
    if (!same(withoutHidden(prev), withoutHidden(next))) edited.push(label)
  }
  sectionsTouched += edited.length
  if (hid.length) lines.push(say(lang, `Gizlendi: ${quote(hid)}`, `Hidden: ${quote(hid)}`))
  if (showed.length) lines.push(say(lang, `Gösterildi: ${quote(showed)}`, `Shown: ${quote(showed)}`))
  if (edited.length) lines.push(say(lang, `İçeriği değişti: ${quote(edited)}`, `Content changed: ${quote(edited)}`))

  const sameMultiset = !added.length && !removed.length
  if (sameMultiset && !same(before.sections.map((s) => s.type), after.sections.map((s) => s.type))) {
    lines.push(say(lang, 'Bölüm sırası değişti', 'Section order changed'))
  }

  if (!same(before.contactActions, after.contactActions)) lines.push(say(lang, 'Telefon/WhatsApp butonları güncellendi', 'Phone/WhatsApp buttons updated'))
  if (!same(before.social, after.social)) lines.push(say(lang, 'Sosyal medya bağlantıları güncellendi', 'Social links updated'))

  return { lines, sectionsTouched }
}

/** Instructions that legitimately touch many sections at once. */
const BROAD_INSTRUCTION =
  /(t[uü]m\b|b[uü]t[uü]n|hepsi|her\s*(?:yer|bol[uü]m|sey|şey)|\bsite\w*\s+(?:dil|tema)|[cç]evir|translate|\ball\b|\bentire\b|\bwhole\b|\bevery\b|yeniden\s+yaz|rewrite|\bdil\w*\b|language|\btema\b|theme|ton\w*|[uü]slup)/i

export const MAX_SECTIONS_PER_FOCUSED_EDIT = 4

/** True when an edit touched far more sections than a focused instruction implies. */
export function isOverBroadEdit(summary: SiteChangeSummary, instruction: string): boolean {
  return summary.sectionsTouched > MAX_SECTIONS_PER_FOCUSED_EDIT && !BROAD_INSTRUCTION.test(instruction)
}
