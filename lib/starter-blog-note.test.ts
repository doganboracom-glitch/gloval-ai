import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PlanResult, type Plan } from '@/components/plan-result'
import { PLAN_BLOG_LINE } from '@/lib/starter-blog-note'
import {
  AUTO_ENABLE_PATCH,
  BLOG_REPORT_DEPARTMENT,
  BLOG_REPORT_SERVICE,
  blogReportMessage,
  blogReportTarget,
  blogReportTicketHref,
  shouldAutoEnableBlog,
  starterCardState,
  supportMailHref,
} from '@/lib/starter-blog-card'
import { parseTicketPrefill } from '@/lib/support/prefill'
import type { BlogPost } from '@/lib/blog'

const plan: Plan = {
  siteName: 'Aksoy Diş Kliniği',
  tagline: 'Gülüşünüz için',
  tone: 'Sakin',
  audience: 'Aileler',
  palette: [{ name: 'Mavi', hex: '#2563eb' }],
  pages: ['Anasayfa'],
  sections: [{ title: 'Hero', description: 'Karşılama' }],
}

function render(lang: 'tr' | 'en') {
  return renderToStaticMarkup(
    createElement(LanguageProvider, { initialLang: lang, children: createElement(PlanResult, { plan }) }),
  )
}

const now = new Date('2026-10-18T12:00:00Z')

function starter(over: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    status: 'published',
    publishedAt: '2026-10-18T11:00:00Z',
    aiGenerated: true,
    personalized: false,
    sample: false,
    indexable: false,
    ...over,
  } as unknown as BlogPost
}

describe('plan card', () => {
  it.each(['tr', 'en'] as const)('shows the blog line once (%s)', (lang) => {
    const html = render(lang)
    expect(html).toContain(PLAN_BLOG_LINE[lang])
    expect(html.split('data-testid="plan-blog-line"')).toHaveLength(2)
  })
})

describe('shouldAutoEnableBlog', () => {
  it('fires for a new site once a starter post is live', () => {
    expect(shouldAutoEnableBlog({ starterAutoEnabled: false }, [starter()], now)).toBe(true)
  })

  it('waits while the starter post is still scheduled in the future', () => {
    const future = starter({ publishedAt: '2026-10-19T00:00:00Z' })
    expect(shouldAutoEnableBlog({ starterAutoEnabled: false }, [future], now)).toBe(false)
  })

  it('never fires for old sites (no marker) or after it already ran', () => {
    expect(shouldAutoEnableBlog(undefined, [starter()], now)).toBe(false)
    expect(shouldAutoEnableBlog({ showInMenu: false }, [starter()], now)).toBe(false)
    expect(shouldAutoEnableBlog({ ...AUTO_ENABLE_PATCH, showInMenu: false }, [starter()], now)).toBe(false)
  })
})

describe('starterCardState', () => {
  const base = { now, starterPending: true, waitExpired: false }

  it('preparing while the new site waits for its first post', () => {
    expect(starterCardState({ ...base, settings: { starterAutoEnabled: false }, posts: [] })).toBe('preparing')
  })

  it('success once a starter post is live', () => {
    expect(starterCardState({ ...base, settings: { starterAutoEnabled: false }, posts: [starter()] })).toBe('success')
  })

  it('failed after the wait expires with no post', () => {
    expect(starterCardState({ ...base, waitExpired: true, settings: { starterAutoEnabled: false }, posts: [] })).toBe('failed')
  })

  it('hidden once dismissed, for old sites, and while posts are loading', () => {
    expect(starterCardState({ ...base, settings: { starterCardDismissed: true }, posts: [starter()] })).toBe('hidden')
    expect(starterCardState({ ...base, starterPending: false, settings: undefined, posts: [starter()] })).toBe('hidden')
    expect(starterCardState({ ...base, settings: { starterAutoEnabled: false }, posts: undefined })).toBe('hidden')
  })
})

describe('blog report ticket link', () => {
  const args = { projectId: 'abc-123', siteUrl: 'https://demo.gloval.site', lang: 'tr' as const }

  function parse(href: string) {
    const url = new URL(href, 'https://gloval.ai')
    return { path: url.pathname, params: url.searchParams }
  }

  it('targets the new-ticket page, not a mailto', () => {
    const href = blogReportTicketHref(args)
    expect(href.startsWith('/support/new?')).toBe(true)
    expect(href).not.toContain('mailto:')
  })

  it('prefills subject, category, project id and site address', () => {
    const { params } = parse(blogReportTicketHref(args))
    expect(params.get('subject')).toBe('Blog yazısı sorunu')
    expect(params.get('department')).toBe(BLOG_REPORT_DEPARTMENT)
    expect(params.get('service')).toBe(BLOG_REPORT_SERVICE)
    expect(params.get('project')).toBe('abc-123')
    const message = params.get('message') ?? ''
    expect(message).toContain('abc-123')
    expect(message).toContain('https://demo.gloval.site')
  })

  it('says the site is unpublished when there is no address yet', () => {
    const message = blogReportMessage({ projectId: 'abc-123', siteUrl: null, lang: 'tr' })
    expect(message).toContain('Henüz yayınlanmadı')
    expect(message).toContain('abc-123')
  })

  it('uses English copy for the en language', () => {
    const { params } = parse(blogReportTicketHref({ ...args, lang: 'en' }))
    expect(params.get('subject')).toBe('Blog post issue')
  })

  it('round-trips through the ticket page parser so the fields arrive prefilled', () => {
    const { params } = parse(blogReportTicketHref(args))
    const raw = Object.fromEntries(params.entries())
    const prefill = parseTicketPrefill(raw, ['abc-123'])
    expect(prefill.subject).toBe('Blog yazısı sorunu')
    expect(prefill.projectId).toBe('abc-123')
    expect(prefill.department).toBe(BLOG_REPORT_DEPARTMENT)
    expect(prefill.service).toBe(BLOG_REPORT_SERVICE)
    expect(prefill.message).toContain('https://demo.gloval.site')
  })
})

describe('blogReportTarget', () => {
  const base = { projectId: 'abc-123', siteUrl: null, lang: 'tr' as const, email: 'destek@gloval.ai' }

  it('uses the ticket page while the support area is reachable', () => {
    const target = blogReportTarget({ ...base, supportReachable: true })
    expect(target.kind).toBe('ticket')
    expect(target.href.startsWith('/support/new?')).toBe(true)
  })

  it('falls back to the mailto only when support is unreachable', () => {
    const target = blogReportTarget({ ...base, supportReachable: false })
    expect(target.kind).toBe('mail')
    expect(target.href.startsWith('mailto:destek@gloval.ai?subject=')).toBe(true)
    expect(decodeURIComponent(target.href)).toContain('abc-123')
  })
})

describe('supportMailHref', () => {
  it('prefills the subject and body with the project id', () => {
    const href = supportMailHref({ email: 'destek@gloval.ai', projectId: 'abc-123', lang: 'tr' })
    expect(href.startsWith('mailto:destek@gloval.ai?subject=')).toBe(true)
    expect(decodeURIComponent(href)).toContain('abc-123')
  })
})
