import { describe, expect, it } from 'vitest'
import type { WebsiteSchema } from '@/lib/website-schema'
import {
  buildTenantSocialMetadata,
  getTenantOgImageCandidates,
  trustedSupabaseImageUrl,
} from './site-sharing'

const storageUrl = 'https://project.supabase.co/storage/v1/object/public/site-images/generated/hero.webp'

function testSite(overrides: Partial<WebsiteSchema> = {}) {
  const schema = {
    meta: {
      name: 'Luna Mücevher',
      tagline: 'Günlük lüks, kalıcı tasarım',
      description: 'Özgün tasarımlı takılar.',
      language: 'tr',
      tone: 'minimal',
      audience: 'takı severler',
      seoTitle: 'Online Takı Mağazası',
      ...overrides.meta,
    },
    theme: {
      mode: 'light',
      palette: [
        { name: 'background', hex: '#fff8f6' },
        { name: 'text', hex: '#0f1724' },
        { name: 'accent', hex: '#b88640' },
      ],
      radius: 'medium',
      ...overrides.theme,
    },
    navigation: {
      logoText: 'Luna Mücevher',
      links: [{ label: 'Ana Sayfa', href: '/' }],
      ...overrides.navigation,
    },
    sections: overrides.sections ?? [
      {
        type: 'hero',
        title: 'Zamansız tasarımlar',
        description: 'Günlük lüks, kalıcı tasarım',
        image: { src: storageUrl, alt: 'Luna koleksiyonu' },
      },
      {
        type: 'gallery',
        title: 'Öne çıkanlar',
        items: [{ image: { src: 'https://project.supabase.co/storage/v1/object/public/site-images/featured.webp' } }],
      },
    ],
    pages: overrides.pages ?? [],
    ...overrides,
  } as unknown as WebsiteSchema

  return { name: 'Luna Mücevher', schema }
}

describe('getTenantOgImageCandidates', () => {
  it('prioritizes the explicit share image, then hero, then featured site media', () => {
    const site = testSite({
      meta: {
        name: 'Luna Mücevher',
        tagline: 'Günlük lüks, kalıcı tasarım',
        description: 'Özgün tasarımlı takılar.',
        language: 'tr',
        tone: 'minimal',
        audience: 'takı severler',
        ogImage: 'https://project.supabase.co/storage/v1/object/public/site-images/share.png',
        seoTitle: 'Online Takı Mağazası',
      } as WebsiteSchema['meta'],
    })

    expect(getTenantOgImageCandidates(site.schema)).toEqual([
      'https://project.supabase.co/storage/v1/object/public/site-images/share.png',
      storageUrl,
      'https://project.supabase.co/storage/v1/object/public/site-images/featured.webp',
    ])
  })

  it('skips hidden sections and duplicate image sources', () => {
    const site = testSite({
      sections: [
        {
          type: 'hero',
          title: 'Hero',
          description: '',
          image: { src: storageUrl },
        },
        {
          type: 'gallery',
          hidden: true,
          title: 'Hidden',
          items: [{ image: { src: 'https://project.supabase.co/storage/v1/object/public/site-images/hidden.png' } }],
        },
        {
          type: 'gallery',
          title: 'Visible',
          items: [{ image: { src: storageUrl } }],
        },
      ] as unknown as WebsiteSchema['sections'],
    })

    expect(getTenantOgImageCandidates(site.schema)).toEqual([storageUrl])
  })
})

describe('trustedSupabaseImageUrl', () => {
  const supabaseUrl = 'https://project.supabase.co'

  it('accepts only HTTPS image files in the configured public site-images bucket', () => {
    expect(trustedSupabaseImageUrl(storageUrl, supabaseUrl)).toBe(storageUrl)
    expect(
      trustedSupabaseImageUrl(
        'https://project.supabase.co/storage/v1/object/public/site-images/logo.svg',
        supabaseUrl,
      ),
    ).toBeNull()
  })

  it('rejects external origins, credentials, non-image buckets, query strings, and encoded paths', () => {
    const rejected = [
      'https://attacker.example/image.png',
      'http://project.supabase.co/storage/v1/object/public/site-images/image.png',
      'https://user:pass@project.supabase.co/storage/v1/object/public/site-images/image.png',
      'https://project.supabase.co/storage/v1/object/public/avatars/image.png',
      'https://project.supabase.co/storage/v1/object/public/site-images/image.png?width=1200',
      'https://project.supabase.co/storage/v1/object/public/site-images/%2e%2e/avatars/image.png',
      'https://project.supabase.co/storage/v1/object/public/site-images/image.png#fragment',
    ]

    for (const candidate of rejected) {
      expect(trustedSupabaseImageUrl(candidate, supabaseUrl)).toBeNull()
    }
    expect(trustedSupabaseImageUrl(storageUrl, undefined)).toBeNull()
  })
})

describe('buildTenantSocialMetadata', () => {
  it('uses the tenant origin and keeps Open Graph and Twitter values aligned', () => {
    const site = testSite()
    const metadata = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.com',
      lastModified: '2026-10-30T12:00:00.000Z',
      canonical: '/urunlerimiz',
    })
    const openGraph = metadata.openGraph as {
      siteName: string
      title: string
      description: string
      url: string
      locale: string
      images: { url: string; width: number; height: number; alt: string }[]
    }
    const twitter = metadata.twitter as {
      card: string
      title: string
      description: string
      images: string[]
    }

    expect(metadata.metadataBase?.toString()).toBe('https://luna-mucevher.com/')
    expect(metadata.alternates?.canonical).toBe('https://luna-mucevher.com/urunlerimiz')
    expect(openGraph.siteName).toBe('Luna Mücevher')
    expect(openGraph.url).toBe('https://luna-mucevher.com/urunlerimiz')
    expect(openGraph.locale).toBe('tr_TR')
    expect(openGraph.title).toBe(twitter.title)
    expect(openGraph.description).toBe(twitter.description)
    expect(openGraph.images[0].url).toBe(twitter.images[0])
    expect(openGraph.images[0]).toMatchObject({ width: 1200, height: 630 })
    expect(openGraph.images[0].alt).toContain('Luna Mücevher')
    expect(openGraph.images[0].url).toContain('https://luna-mucevher.com/site/luna-mucevher/opengraph-image?v=')
    expect(JSON.stringify(metadata)).not.toContain('gloval.ai')
  })

  it('changes the versioned image URL after republish and supports English locale', () => {
    const site = testSite({
      meta: {
        name: 'Luna Mücevher',
        tagline: 'Timeless design',
        description: 'Original jewelry.',
        language: 'en',
        tone: 'minimal',
        audience: 'jewelry lovers',
        seoTitle: 'Online Jewelry Store',
      } as WebsiteSchema['meta'],
    })
    const first = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.gloval.site',
      lastModified: '2026-10-29T12:00:00.000Z',
    })
    const second = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.gloval.site',
      lastModified: '2026-10-30T12:00:00.000Z',
    })
    const firstImage = (first.openGraph as { images: { url: string }[] }).images[0].url
    const secondImage = (second.openGraph as { images: { url: string }[] }).images[0].url

    expect(firstImage).not.toBe(secondImage)
    expect((first.openGraph as { locale: string }).locale).toBe('en_US')
  })

  it('cleans the owner-authored description, caps it, and shares one value everywhere', () => {
    const site = testSite()
    site.schema.meta.description = `<p>Takılar &amp; tasarım.</p><script>ignored</script>${'x'.repeat(180)}`

    const metadata = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.gloval.site',
    })
    const openGraph = metadata.openGraph as { description: string }
    const twitter = metadata.twitter as { description: string }
    const expected = Array.from(`Takılar & tasarım. ${'x'.repeat(180)}`).slice(0, 160).join('')

    expect(metadata.description).toBe(expected)
    expect(openGraph.description).toBe(expected)
    expect(twitter.description).toBe(expected)
    expect(Array.from(metadata.description ?? '')).toHaveLength(160)
    expect(metadata.description).not.toContain('<')
  })

  it('ignores legacy Gloval credit copy and falls back to the hero, then About, then name and sector', () => {
    const site = testSite()
    site.schema.meta.description = 'Luna Mücevher Isimli — GLOVAL AI ile oluşturuldu.'
    site.schema.sections = [
      {
        type: 'hero',
        title: 'Hero',
        description: '<p>Günlük <strong>lüks</strong>, kalıcı tasarım.</p>',
        image: { imagePrompt: '', src: storageUrl },
      },
      { type: 'about', title: 'Hakkımızda', body: 'İlk cümle burada. İkinci cümle burada.' },
    ] as unknown as WebsiteSchema['sections']

    const heroMetadata = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.gloval.site',
    })
    expect(heroMetadata.description).toBe('Günlük lüks, kalıcı tasarım.')
    expect(JSON.stringify(heroMetadata)).not.toContain('GLOVAL AI ile oluşturuldu')

    site.schema.sections[0] = {
      type: 'hero',
      title: 'Hero',
      description: '',
      image: { imagePrompt: '', src: storageUrl },
    }
    const aboutMetadata = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.gloval.site',
    })
    expect(aboutMetadata.description).toBe('İlk cümle burada.')

    site.schema.sections = []
    const nameSectorMetadata = buildTenantSocialMetadata({
      site,
      slug: 'luna-mucevher',
      origin: 'https://luna-mucevher.gloval.site',
    })
    expect(nameSectorMetadata.description).toBe('Luna Mücevher - Online Takı Mağazası')
  })
})
