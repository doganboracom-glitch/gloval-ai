export type NoteLang = 'tr' | 'en'

export const STARTER_NOTE_COPY = {
  tr: {
    title: 'Blog için 3 örnek yazı hazırlanıyor',
    body: 'Sektörünüze ve sitenizin konusuna uygun 3 örnek yazı otomatik eklenir. Yazılar hemen yayında olur, ancak özelleştirene kadar arama motorlarında görünmez. Blog sekmesinden düzenleyebilirsiniz.',
    dismiss: 'Notu kapat',
  },
  en: {
    title: '3 sample blog posts are being prepared',
    body: 'Three sample posts that fit your sector and site topic are added automatically. They go live right away but stay hidden from search engines until you personalize them. Edit them from the Blog tab.',
    dismiss: 'Dismiss note',
  },
} as const

export function starterNoteStorageKey(projectId: string): string {
  return `gloval:starter-blog-note:${projectId}`
}

/** Plan-card line shown with the generated plan, before the site exists. */
export const PLAN_BLOG_LINE = {
  tr: 'Blog: sektörünüze uygun 3 örnek yazı otomatik eklenir.',
  en: 'Blog: 3 sample posts for your sector are added automatically.',
} as const
