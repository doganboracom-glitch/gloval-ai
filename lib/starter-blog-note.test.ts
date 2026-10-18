import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PlanResult, type Plan } from '@/components/plan-result'
import { PLAN_BLOG_LINE } from '@/lib/starter-blog-note'
import {
  AUTO_ENABLE_PATCH,
  shouldAutoEnableBlog,
  starterCardState,
  supportMailHref,
} from '@/lib/starter-blog-card'
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

describe('supportMailHref', () => {
  it('prefills the subject and body with the project id', () => {
    const href = supportMailHref({ email: 'destek@gloval.ai', projectId: 'abc-123', lang: 'tr' })
    expect(href.startsWith('mailto:destek@gloval.ai?subject=')).toBe(true)
    expect(decodeURIComponent(href)).toContain('abc-123')
  })
})
