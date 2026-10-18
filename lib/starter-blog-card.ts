import { isStarterPost, livePosts, type BlogPost } from '@/lib/blog'
import type { NoteLang } from '@/lib/starter-blog-note'
import type { BlogSettings } from '@/lib/website-schema'

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
      lead: 'Blog makaleleriniz yayınlandı. Göz atmanızı öneririz. Yapay zekâ hata yapabilir; bir sorun görürseniz lütfen bize ',
      link: 'bildirin',
      tail: '.',
    },
    failed: { title: 'Örnek yazılar hazırlanamadı', body: 'Yazılar şu an eklenemedi. Tekrar deneyebilirsiniz.', retry: 'Yeniden dene', retrying: 'Hazırlanıyor...' },
    dismiss: 'Kartı kapat',
    mailSubject: 'Blog yazısı sorunu',
    mailBody: 'Merhaba, blog yazılarımda bir sorun gördüm:',
  },
  en: {
    preparing: { title: '3 sample blog posts are being prepared', body: 'Posts that fit your sector are being written. This can take a few minutes.' },
    success: {
      title: 'Your blog posts are live',
      lead: 'Your blog posts are live. We recommend taking a look. AI can make mistakes; if you see a problem, please ',
      link: 'report it',
      tail: '.',
    },
    failed: { title: 'Sample posts could not be prepared', body: 'The posts could not be added right now. You can try again.', retry: 'Try again', retrying: 'Preparing...' },
    dismiss: 'Dismiss card',
    mailSubject: 'Blog post issue',
    mailBody: 'Hello, I noticed a problem with my blog posts:',
  },
} as const

/** Support mailto with the subject and project id already filled in. */
export function supportMailHref(args: { email: string; projectId: string; lang: NoteLang }): string {
  const copy = STARTER_CARD_COPY[args.lang]
  const subject = `${copy.mailSubject} (${args.projectId})`
  const body = `${copy.mailBody}\n\n\nProject ID: ${args.projectId}`
  return `mailto:${args.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
