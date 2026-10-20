import { sanitizeBlogMarkup } from '@/lib/blog-markup'
import { LIMITS, normalizeTags, slugifyBlog } from '@/lib/blog-admin-shared'

/**
 * AI-assisted blog drafts.
 *
 * The model is told to stay general and educational, and its answer is then
 * cleaned deterministically: every sentence that carries a statistic, quote,
 * award, citation or link is removed before the draft is saved. A draft is
 * always saved as `draft` - a person has to read and publish it.
 */

export const DRAFT_TOPIC_MAX = 160
export const DRAFT_KEYWORD_MAX = 8

export type DraftRequest = { topic: string; keywords: string[] }

export function normalizeDraftRequest(raw: unknown): { ok: true; value: DraftRequest } | { ok: false } {
  if (!raw || typeof raw !== 'object') return { ok: false }
  const { topic, keywords } = raw as { topic?: unknown; keywords?: unknown }
  const cleanTopic = typeof topic === 'string' ? topic.replace(/\s+/g, ' ').trim() : ''
  if (cleanTopic.length < 5 || cleanTopic.length > DRAFT_TOPIC_MAX) return { ok: false }
  const list = Array.isArray(keywords)
    ? keywords
    : typeof keywords === 'string'
      ? keywords.split(',')
      : []
  const cleanKeywords = [
    ...new Set(
      list
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.replace(/\s+/g, ' ').trim().slice(0, 40))
        .filter(Boolean),
    ),
  ].slice(0, DRAFT_KEYWORD_MAX)
  return { ok: true, value: { topic: cleanTopic, keywords: cleanKeywords } }
}

export const DRAFT_SYSTEM = [
  'Sen GLOVAL AI blogu için Türkçe taslak yazan bir editörsün. GLOVAL AI, küçük işletmelerin yapay zekâ ile web sitesi kurmasını sağlayan bir üründür.',
  'Yazı genel, öğretici ve pratik olmalı; okuyucuya somut adımlar ve açıklamalar sun.',
  'KESİN YASAKLAR: istatistik, yüzde, rakamsal iddia; araştırma, anket veya rapor atfı; kaynak veya bağlantı; alıntı ve tırnak içinde sözler; müşteri yorumu veya referans; ödül, sıralama, rakip karşılaştırması; doğrulayamayacağın her türlü olgusal iddia.',
  'Biçim: yalnızca ## başlık, - madde listesi, **kalın** ve normal paragraf kullan. HTML, görsel, bağlantı ve alıntı bloğu kullanma.',
  'Gövde 450 ile 800 kelime arasında olsun, 3 ila 5 adet ## başlık içersin. Başlık, özet ve meta açıklama abartısız olsun.',
].join('\n')

export function buildDraftPrompt(request: DraftRequest): string {
  return [
    `Konu: ${request.topic}`,
    request.keywords.length ? `Doğal biçimde geçirilecek anahtar kelimeler: ${request.keywords.join(', ')}` : null,
    'Alanlar: title (en çok 70 karakter), excerpt (en çok 200 karakter), body, seoTitle (en çok 60 karakter), metaDescription (en çok 155 karakter), tags (en çok 5 kısa etiket).',
  ]
    .filter(Boolean)
    .join('\n')
}

export type RawDraft = {
  title?: unknown
  excerpt?: unknown
  body?: unknown
  seoTitle?: unknown
  metaDescription?: unknown
  tags?: unknown
}

export type CleanDraft = {
  title: string
  excerpt: string
  body: string
  seoTitle: string
  metaDescription: string
  tags: string[]
  removedSentences: number
}

const UNVERIFIABLE: RegExp[] = [
  /%|\bpercent\b|\byüzde\b/i,
  /\d[\d.,]*\s*(milyon|milyar|bin\b|million|billion|thousand)/i,
  /\d+\s*(kat|katı|misli|kez daha|x daha)\b/i,
  /\bödül|\baward|\bbirincisi\b|\ben iyi\b|\bnumber one\b|\bnumara bir\b/i,
  /araştırma|istatistik|anket|rapor(a|lara)?\s+göre|çalışmaya göre|\bkaynak:|\(kaynak|according to|\bstud(y|ies)\b|\bsurvey|\bstatistic|\bsource:/i,
  /[“”«»]|"[^"]{12,}"/,
  /\b(dedi|diyor ki|söyledi|müşterimiz|müşterilerimiz|referans|testimonial|yorum yaptı)\b/i,
  /https?:\/\/|www\.|\[[^\]]*\]\([^)]*\)|!\[/i,
]

export function isUnverifiable(sentence: string): boolean {
  return UNVERIFIABLE.some((re) => re.test(sentence))
}

function stripLinks(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

/** Drops unverifiable sentences from markup and reports how many were removed. */
export function cleanDraftBody(raw: string): { body: string; removed: number } {
  let removed = 0
  const lines: string[] = []
  for (const original of sanitizeBlogMarkup(raw).split('\n')) {
    const line = original.trim()
    if (!line) {
      lines.push('')
      continue
    }
    if (line.startsWith('>')) {
      removed += 1
      continue
    }
    const prefix = line.startsWith('## ') ? '## ' : line.startsWith('- ') ? '- ' : ''
    const text = stripLinks(prefix ? line.slice(prefix.length) : line)
    if (prefix) {
      if (isUnverifiable(text) || !text.trim()) removed += 1
      else lines.push(`${prefix}${text}`)
      continue
    }
    const sentences = text.split(/(?<=[.!?])\s+/)
    const kept = sentences.filter((s) => !isUnverifiable(s))
    removed += sentences.length - kept.length
    if (kept.length) lines.push(kept.join(' '))
  }
  return { body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), removed }
}

const asText = (value: unknown, max: number) =>
  (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '').slice(0, max)

/** Final shape of a draft: bounded fields, no unverifiable text anywhere. */
export function cleanDraft(raw: RawDraft, fallbackTitle: string): CleanDraft | null {
  const { body, removed } = cleanDraftBody(typeof raw.body === 'string' ? raw.body : '')
  if (body.length < 200) return null
  const safe = (value: unknown, max: number, fallback = '') => {
    const text = stripLinks(asText(value, max))
    return text && !isUnverifiable(text) ? text : fallback
  }
  const title = safe(raw.title, LIMITS.title, fallbackTitle.slice(0, LIMITS.title)) || fallbackTitle.slice(0, LIMITS.title)
  const excerpt = safe(raw.excerpt, LIMITS.excerpt)
  return {
    title,
    excerpt,
    body,
    seoTitle: safe(raw.seoTitle, LIMITS.seoTitle, title.slice(0, LIMITS.seoTitle)),
    metaDescription: safe(raw.metaDescription, LIMITS.metaDescription, excerpt.slice(0, LIMITS.metaDescription)),
    tags: normalizeTags(raw.tags).filter((tag) => !isUnverifiable(tag)),
    removedSentences: removed,
  }
}

/** A slug the editor can save as-is; the caller appends a suffix on collision. */
export function draftSlug(title: string): string {
  return slugifyBlog(title) || 'taslak'
}
