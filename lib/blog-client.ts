import type { BlogPost } from '@/lib/blog'

import type { BlogOperation } from '@/lib/blog-operations'

export type BlogAiOutcome =
  | { ok: true; post: BlogPost; balance: number }
  | {
      ok: false
      reason: 'credits' | 'limit' | 'daily' | 'duplicate' | 'confirm' | 'answers' | 'failed' | 'sample' | 'suspended' | 'notfound'
    }

/** Fired after an AI-editor blog operation so an open Blog tab reloads its list. */
export const BLOG_CHANGED_EVENT = 'gloval:blog-changed'

type Lang = 'tr' | 'en'

const OPERATION_TEXT = {
  tr: {
    confirmCreate: (topic: string) =>
      `"${topic}" konulu bir blog yazısı taslağı hazırlanacak. Yalnızca yazı başarıyla kaydedilirse 3 AI kredisi düşer. Devam edilsin mi?`,
    confirmPersonalize:
      'Seçilen yazı firma bilgilerinizle yeniden yazılacak, kişiselleştirilmiş sayılacak ve arama motorlarına açılacak. Yalnızca başarılı olursa 3 AI kredisi düşer. Devam edilsin mi?',
    created: (title: string) => `Taslak hazır: "${title}". Blog sekmesinden gözden geçirip yayınlayabilirsiniz.`,
    personalized: (title: string) => `"${title}" firmanıza özelleştirildi (3 kredi).`,
    published: (title: string) => `"${title}" yayınlandı.`,
    drafted: (title: string) => `"${title}" taslağa alındı.`,
    cancelled: 'İşlem iptal edildi, kredi düşmedi.',
    notAvailable: 'Blog işlemleri için editörde Blog sekmesi gerekir.',
    credits: 'AI krediniz yetersiz.',
    daily: 'Günlük işlem sınırına ulaştınız.',
    duplicate: 'Bu işlem zaten çalışıyor veya tamamlandı.',
    answers: 'Önce Blog sekmesinden firma bilgilerinizi (3-5 soru) doldurun.',
    sample: 'Örnek içerik doğrudan yayınlanamaz. Önce "AI ile özelleştir" kullanın veya Blog sekmesinden onaylayın.',
    suspended: 'Aboneliğiniz askıda olduğu için yayınlama kapalı.',
    notfound: 'İlgili blog yazısı bulunamadı.',
    limit: 'Blog yazı sınırına ulaşıldı.',
    failed: 'Blog işlemi tamamlanamadı. Kredi düşmedi.',
  },
  en: {
    confirmCreate: (topic: string) =>
      `A blog post draft about "${topic}" will be written. 3 AI credits are used only if the post is saved successfully. Continue?`,
    confirmPersonalize:
      'The selected post will be rewritten with your business details, counted as personalized and opened to search engines. 3 AI credits are used only on success. Continue?',
    created: (title: string) => `Draft ready: "${title}". Review and publish it from the Blog tab.`,
    personalized: (title: string) => `"${title}" was personalized for your business (3 credits).`,
    published: (title: string) => `"${title}" was published.`,
    drafted: (title: string) => `"${title}" was moved back to draft.`,
    cancelled: 'Cancelled. No credits were used.',
    notAvailable: 'Blog operations need the Blog tab in the editor.',
    credits: 'You do not have enough AI credits.',
    daily: 'You reached the daily action limit.',
    duplicate: 'This action is already running or finished.',
    answers: 'Fill in your business details (3-5 questions) in the Blog tab first.',
    sample: 'Sample content cannot be published directly. Use "Personalize with AI" or confirm it in the Blog tab.',
    suspended: 'Publishing is disabled while your subscription is suspended.',
    notfound: 'The blog post was not found.',
    limit: 'The blog post limit was reached.',
    failed: 'The blog action could not be completed. No credits were used.',
  },
} as const

export function blogOperationCopy(lang: Lang) {
  return OPERATION_TEXT[lang]
}

/** The confirmation prompt for a credit-spending operation, or null when it is free. */
export function blogOperationConfirmText(lang: Lang, operation: BlogOperation): string | null {
  const copy = OPERATION_TEXT[lang]
  if (operation.op === 'createPost') return copy.confirmCreate(operation.topic)
  if (operation.op === 'personalizePost') return copy.confirmPersonalize
  return null
}

export function blogOperationSuccessText(lang: Lang, operation: BlogOperation, post: BlogPost): string {
  const copy = OPERATION_TEXT[lang]
  if (operation.op === 'createPost') return copy.created(post.title)
  if (operation.op === 'personalizePost') return copy.personalized(post.title)
  return operation.status === 'published' ? copy.published(post.title) : copy.drafted(post.title)
}

export function blogFailureText(lang: Lang, reason: Extract<BlogAiOutcome, { ok: false }>['reason']): string {
  const copy = OPERATION_TEXT[lang]
  if (reason === 'confirm') return copy.cancelled
  if (reason === 'credits') return copy.credits
  if (reason === 'daily') return copy.daily
  if (reason === 'duplicate') return copy.duplicate
  if (reason === 'answers') return copy.answers
  if (reason === 'sample') return copy.sample
  if (reason === 'suspended') return copy.suspended
  if (reason === 'notfound') return copy.notfound
  if (reason === 'limit') return copy.limit
  return copy.failed
}

/** A fresh id per user action: the server charges each id at most once. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

export async function callBlogAi(
  path: '/api/blog/ai-write' | '/api/blog/personalize' | '/api/blog/operation',
  body: unknown,
): Promise<BlogAiOutcome> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as { post?: BlogPost; balance?: number; error?: string } | null
    if (res.ok && data?.post) return { ok: true, post: data.post, balance: data.balance ?? 0 }
    if (res.status === 402) return { ok: false, reason: 'credits' }
    if (res.status === 429) return { ok: false, reason: 'daily' }
    if (res.status === 404) return { ok: false, reason: 'notfound' }
    if (res.status === 409) {
      if (data?.error === 'duplicate') return { ok: false, reason: 'duplicate' }
      if (data?.error === 'sample_content') return { ok: false, reason: 'sample' }
      if (data?.error === 'suspended') return { ok: false, reason: 'suspended' }
      return { ok: false, reason: 'limit' }
    }
    if (res.status === 400 && data?.error === 'confirmation_required') return { ok: false, reason: 'confirm' }
    if (res.status === 422 && data?.error === 'answers_required') return { ok: false, reason: 'answers' }
    return { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}
