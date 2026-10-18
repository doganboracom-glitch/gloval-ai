import { isStarterPost, livePosts, type BlogPost } from '@/lib/blog'
import { newTicketHref } from '@/lib/support/prefill'
import type { NoteLang } from '@/lib/starter-blog-note'
import type { BlogSettings } from '@/lib/website-schema'

export const BLOG_REPORT_DEPARTMENT = 'website'
export const BLOG_REPORT_SERVICE = 'ai_content'

export type StarterCardState = 'hidden' | 'preparing' | 'success' | 'failed'

/** How long a just-created site shows "preparing" before the card offers a retry. */
export const STARTER_CARD_WAIT_MS = 60_000

/** Live (published, past its time on the server clock) starter posts. */
export function liveStarterPosts(posts: readonly BlogPost[] | undefined, now: Date): BlogPost[] {
  return livePosts((posts ?? []).filter(isStarterPost), now)
}

/**
 * Only sites generated with the marker (`starterAutoEnabled` present) or still
 * inside the just-created window take part. Every older site keeps its settings.
 */
function takesPart(settings: BlogSettings | undefined, starterPending: boolean): boolean {
  return settings?.starterAutoEnabled !== undefined || starterPending
}

/**
 * True exactly once per new site: the starter posts are public, the site was
 * generated with the marker, and the switch-on has not happened yet. After it
 * runs `starterAutoEnabled` is true, so an owner who turns the blog off again
 * is never overridden, and sites without the marker are never touched.
 */
export function shouldAutoEnableBlog(settings: BlogSettings | undefined, posts: readonly BlogPost[] | undefined, now: Date): boolean {
  return settings?.starterAutoEnabled === false && liveStarterPosts(posts, now).length > 0
}

export const AUTO_ENABLE_PATCH = { showInMenu: true, showLatest: true, starterAutoEnabled: true } as const

export function starterCardState(args: {
  settings: BlogSettings | undefined
  posts: readonly BlogPost[] | undefined
  now: Date
  /** The site was created moments ago and the posts are still being written. */
  starterPending: boolean
  /** The short wait for the first post has run out. */
  waitExpired: boolean
}): StarterCardState {
  const { settings, posts, now, starterPending, waitExpired } = args
  if (settings?.starterCardDismissed === true) return 'hidden'
  if (!takesPart(settings, starterPending)) return 'hidden'
  if (liveStarterPosts(posts, now).length > 0) return 'success'
  if (posts === undefined) return 'hidden'
  return starterPending && !waitExpired ? 'preparing' : 'failed'
}

export const STARTER_CARD_COPY = {
  tr: {
    preparing: { title: 'Blog için 3 örnek yazı hazırlanıyor', body: 'Sektörünüze uygun yazılar yazılıyor. Bu birkaç dakika sürebilir.' },
    success: {
      title: 'Blog makaleleriniz yayınlandı',
      lead: 'Blog makaleleriniz yayınlandı. Göz atmanızı öneririz. Kontrol sonrası sitenizi yeniden yayınlamayı unutmayınız. Yapay zekâ hata yapabilir; bir sorun görürseniz lütfen bize ',
      link: 'bildirin',
      tail: '.',
    },
    failed: { title: 'Örnek yazılar hazırlanamadı', body: 'Yazılar şu an eklenemedi. Tekrar deneyebilirsiniz.', retry: 'Yeniden dene', retrying: 'Hazırlanıyor...' },
    dismiss: 'Kartı kapat',
    mailSubject: 'Blog yazısı sorunu',
    mailBody: 'Merhaba, blog yazılarımda bir sorun gördüm:',
    projectIdLabel: 'Proje kimliği',
    siteLabel: 'Site adresi',
    unpublished: 'Henüz yayınlanmadı',
  },
  en: {
    preparing: { title: '3 sample blog posts are being prepared', body: 'Posts that fit your sector are being written. This can take a few minutes.' },
    success: {
      title: 'Your blog posts are live',
      lead: 'Your blog posts are published. We recommend taking a look. Please remember to republish your site after reviewing. AI can make mistakes; if you notice an issue, please ',
      link: 'let us know',
      tail: '.',
    },
    failed: { title: 'Sample posts could not be prepared', body: 'The posts could not be added right now. You can try again.', retry: 'Try again', retrying: 'Preparing...' },
    dismiss: 'Dismiss card',
    mailSubject: 'Blog post issue',
    mailBody: 'Hello, I noticed a problem with my blog posts:',
    projectIdLabel: 'Project ID',
    siteLabel: 'Site address',
    unpublished: 'Not published yet',
  },
} as const

/** Editable ticket description: what happened, plus the project id and site address. */
export function blogReportMessage(args: { projectId: string; siteUrl?: string | null; lang: NoteLang }): string {
  const copy = STARTER_CARD_COPY[args.lang]
  return [
    copy.mailBody,
    '',
    '',
    `${copy.projectIdLabel}: ${args.projectId}`,
    `${copy.siteLabel}: ${args.siteUrl || copy.unpublished}`,
  ].join('\n')
}

/**
 * The platform's own new-ticket page (the dashboard "Destek" area), prefilled.
 * There is no dedicated blog category, so it files under Website / AI Content.
 */
export function blogReportTicketHref(args: { projectId: string; siteUrl?: string | null; lang: NoteLang }): string {
  return newTicketHref({
    subject: STARTER_CARD_COPY[args.lang].mailSubject,
    message: blogReportMessage(args),
    department: BLOG_REPORT_DEPARTMENT,
    service: BLOG_REPORT_SERVICE,
    projectId: args.projectId,
  })
}

export type BlogReportTarget = { kind: 'ticket' | 'mail'; href: string }

/** The ticket page, or the mailto only when the support area cannot be reached. */
export function blogReportTarget(args: {
  projectId: string
  siteUrl?: string | null
  lang: NoteLang
  email: string
  supportReachable: boolean
}): BlogReportTarget {
  if (args.supportReachable) return { kind: 'ticket', href: blogReportTicketHref(args) }
  return { kind: 'mail', href: supportMailHref(args) }
}

/** Support mailto with the subject and project id already filled in. Fallback only. */
export function supportMailHref(args: { email: string; projectId: string; lang: NoteLang }): string {
  const copy = STARTER_CARD_COPY[args.lang]
  const subject = `${copy.mailSubject} (${args.projectId})`
  const body = `${copy.mailBody}\n\n\nProject ID: ${args.projectId}`
  return `mailto:${args.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
