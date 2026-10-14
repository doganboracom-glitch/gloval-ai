import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  SOCIAL_NETWORKS,
  canUseSocialLinks,
  enforceSocialPlan,
  normalizeSocialInput,
  resolveHeaderSocialLinks,
  resolveSocialLinks,
  sanitizeSocial,
  type SocialNetwork,
} from '@/lib/social-links'
import { applyOperation } from '@/lib/website-edit-operations'
import { ensureContactSection } from '@/lib/contact-section'
import { fallbackWebsite, websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import type { PlanCode } from '@/lib/pricing-config'
import { SocialLinks } from '@/components/website-renderer/social-links'
import { ContactSection } from '@/components/website-renderer/sections/contact-section'
import { WebsiteFooter } from '@/components/website-renderer/sections/website-footer'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'

/** One valid username, its expected URL, and one full link per network. */
const CASES: Record<
  SocialNetwork,
  { host: string; username: string; usernameUrl: string; full: string; fullUrl: string }
> = {
  instagram: {
    host: 'instagram.com',
    username: '@glovalai',
    usernameUrl: 'https://instagram.com/glovalai',
    full: 'https://www.instagram.com/glovalai/',
    fullUrl: 'https://www.instagram.com/glovalai/',
  },
  facebook: {
    host: 'facebook.com',
    username: 'glovalai.page',
    usernameUrl: 'https://facebook.com/glovalai.page',
    full: 'https://facebook.com/glovalai.page',
    fullUrl: 'https://facebook.com/glovalai.page',
  },
  x: {
    host: 'x.com',
    username: '@gloval_ai',
    usernameUrl: 'https://x.com/gloval_ai',
    full: 'https://twitter.com/gloval_ai',
    fullUrl: 'https://twitter.com/gloval_ai',
  },
  linkedin: {
    host: 'linkedin.com',
    username: 'gloval-ai',
    usernameUrl: 'https://linkedin.com/in/gloval-ai',
    full: 'https://www.linkedin.com/company/gloval-ai',
    fullUrl: 'https://www.linkedin.com/company/gloval-ai',
  },
  youtube: {
    host: 'youtube.com',
    username: '@glovalai',
    usernameUrl: 'https://youtube.com/@glovalai',
    full: 'https://www.youtube.com/@glovalai',
    fullUrl: 'https://www.youtube.com/@glovalai',
  },
  tiktok: {
    host: 'tiktok.com',
    username: '@glovalai',
    usernameUrl: 'https://tiktok.com/@glovalai',
    full: 'https://www.tiktok.com/@glovalai',
    fullUrl: 'https://www.tiktok.com/@glovalai',
  },
  pinterest: {
    host: 'pinterest.com',
    username: 'glovalai',
    usernameUrl: 'https://pinterest.com/glovalai',
    full: 'https://www.pinterest.com/glovalai/',
    fullUrl: 'https://www.pinterest.com/glovalai/',
  },
  telegram: {
    host: 't.me',
    username: '@glovalai',
    usernameUrl: 'https://t.me/glovalai',
    full: 'https://t.me/glovalai',
    fullUrl: 'https://t.me/glovalai',
  },
  whatsappChannel: {
    host: 'whatsapp.com',
    username: '0029VaAbCdEfGh',
    usernameUrl: 'https://whatsapp.com/channel/0029VaAbCdEfGh',
    full: 'https://www.whatsapp.com/channel/0029VaAbCdEfGh',
    fullUrl: 'https://www.whatsapp.com/channel/0029VaAbCdEfGh',
  },
}

describe('normalizeSocialInput: every network', () => {
  it('covers every network in the table', () => {
    expect(Object.keys(CASES).sort()).toEqual([...SOCIAL_NETWORKS].sort())
  })

  describe.each(SOCIAL_NETWORKS)('%s', (network) => {
    const c = CASES[network]

    it('turns a username into the profile URL', () => {
      expect(normalizeSocialInput(network, c.username)).toEqual({ status: 'ok', url: c.usernameUrl })
    })

    it('keeps a full https link on the network', () => {
      expect(normalizeSocialInput(network, c.full)).toEqual({ status: 'ok', url: c.fullUrl })
    })

    it('adds https to a link written without a scheme', () => {
      const result = normalizeSocialInput(network, c.fullUrl.replace('https://', ''))
      expect(result).toEqual({ status: 'ok', url: c.fullUrl })
    })

    it('treats empty and whitespace as empty, never as invalid', () => {
      expect(normalizeSocialInput(network, '')).toEqual({ status: 'empty' })
      expect(normalizeSocialInput(network, '   ')).toEqual({ status: 'empty' })
      expect(normalizeSocialInput(network, undefined)).toEqual({ status: 'empty' })
    })

    it('rejects lookalike domains', () => {
      const bad = [
        `https://evil${c.host}/profile`,
        `https://${c.host}.evil.com/profile`,
        `https://${c.host}-login.com/profile`,
        `https://${c.host}@evil.com/profile`,
        `https://evil.com/${c.host}/profile`,
        `https://${c.host.replace('.', '-')}.com/profile`,
      ]
      for (const value of bad) {
        expect(normalizeSocialInput(network, value).status, value).toBe('invalid')
      }
    })

    it('rejects http', () => {
      expect(normalizeSocialInput(network, `http://${c.host}/profile`).status).toBe('invalid')
    })

    it('rejects other schemes', () => {
      for (const value of [
        `javascript:alert(1)//${c.host}/profile`,
        `ftp://${c.host}/profile`,
        `data:text/html,${c.host}/profile`,
        `mailto:a@${c.host}`,
      ]) {
        expect(normalizeSocialInput(network, value).status, value).toBe('invalid')
      }
    })

    it('rejects a bare domain (no profile)', () => {
      expect(normalizeSocialInput(network, c.host).status).toBe('invalid')
      expect(normalizeSocialInput(network, `www.${c.host}`).status).toBe('invalid')
      expect(normalizeSocialInput(network, `https://${c.host}`).status).toBe('invalid')
      expect(normalizeSocialInput(network, `https://${c.host}/`).status).toBe('invalid')
    })

    it('rejects credentials, ports, whitespace and over-long values', () => {
      expect(normalizeSocialInput(network, `https://user:pw@${c.host}/profile`).status).toBe('invalid')
      expect(normalizeSocialInput(network, `https://${c.host}:8443/profile`).status).toBe('invalid')
      expect(normalizeSocialInput(network, 'two words').status).toBe('invalid')
      expect(normalizeSocialInput(network, `https://${c.host}/${'a'.repeat(400)}`).status).toBe('invalid')
    })
  })

  it('rejects a link that belongs to a different network', () => {
    expect(normalizeSocialInput('instagram', 'https://facebook.com/glovalai').status).toBe('invalid')
    expect(normalizeSocialInput('linkedin', 'https://instagram.com/glovalai').status).toBe('invalid')
  })
})

describe('empty networks are never drawn', () => {
  const site = (social: WebsiteSchema['social']): WebsiteSchema => ({
    ...fallbackWebsite('kafe', 'tr'),
    social,
  })

  it('resolves to nothing without a social value, or with only blanks', () => {
    expect(resolveSocialLinks(site(undefined))).toEqual([])
    expect(resolveSocialLinks(null)).toEqual([])
    expect(resolveSocialLinks(site({ instagram: '', facebook: '   ' }))).toEqual([])
  })

  it('keeps only filled networks, in the fixed display order', () => {
    const links = resolveSocialLinks(site({ youtube: '@a-channel', instagram: 'glovalai', x: '' }))
    expect(links.map((l) => l.network)).toEqual(['instagram', 'youtube'])
  })

  it('does not render a stored value that fails validation', () => {
    const links = resolveSocialLinks(site({ instagram: 'http://instagram.com/x', facebook: 'https://evil.com/x' }))
    expect(links).toEqual([])
  })

  it('renders no markup at all (no empty list, no gap) when nothing is set', () => {
    for (const variant of ['contact', 'footer', 'header'] as const) {
      expect(renderToStaticMarkup(createElement(SocialLinks, { links: [], variant }))).toBe('')
      expect(renderToStaticMarkup(createElement(SocialLinks, { variant }))).toBe('')
    }
  })

  it('renders only the filled networks as safe external links', () => {
    const links = resolveSocialLinks(site({ instagram: 'glovalai', linkedin: '' }))
    const html = renderToStaticMarkup(createElement(SocialLinks, { links, variant: 'contact' }))
    expect(html).toContain('data-social-network="instagram"')
    expect(html).not.toContain('data-social-network="linkedin"')
    expect(html.match(/<li/g)).toHaveLength(1)
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('target="_blank"')
  })

  it('header icons need the switch AND at least one link', () => {
    expect(resolveHeaderSocialLinks(site({ instagram: 'glovalai' }))).toEqual([])
    expect(resolveHeaderSocialLinks(site({ showInHeader: true }))).toEqual([])
    expect(
      resolveHeaderSocialLinks(site({ instagram: 'glovalai', showInHeader: true })).map((l) => l.network),
    ).toEqual(['instagram'])
  })
})

describe('plan gate (server authority)', () => {
  const base = (): WebsiteSchema => fallbackWebsite('kafe', 'tr')
  const stored = (): WebsiteSchema => ({ ...base(), social: { instagram: 'https://instagram.com/kept' } })

  it('only FREE is locked', () => {
    const plans: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']
    expect(plans.map(canUseSocialLinks)).toEqual([false, true, true, true])
  })

  it('FREE ignores submitted social values and keeps the stored ones', () => {
    const submitted: WebsiteSchema = {
      ...base(),
      social: { instagram: 'https://instagram.com/hacked', x: 'evil', showInHeader: true },
    }
    const result = enforceSocialPlan(submitted, stored(), 'free')
    expect(result.social).toEqual({ instagram: 'https://instagram.com/kept' })
  })

  it('FREE with nothing stored drops whatever was submitted', () => {
    const submitted: WebsiteSchema = { ...base(), social: { facebook: 'glovalai.page' } }
    const result = enforceSocialPlan(submitted, base(), 'free')
    expect('social' in result).toBe(false)
  })

  it('FREE ignores an AI suggestion exactly like the edit route builds it', () => {
    const original = stored()
    const aiSite: WebsiteSchema = { ...base(), social: { instagram: 'aisuggested', telegram: 'aisuggested' } }
    // Mirrors app/api/edit/route.ts: the model's value wins, then the plan gate runs.
    const restoredBase: WebsiteSchema = { ...aiSite, social: aiSite.social ?? original.social }
    const restored = enforceSocialPlan(restoredBase, original, 'free')
    expect(restored.social).toEqual(original.social)

    const aiOmits: WebsiteSchema = { ...base() }
    const keptBase: WebsiteSchema = { ...aiOmits, social: aiOmits.social ?? original.social }
    expect(enforceSocialPlan(keptBase, original, 'free').social).toEqual(original.social)
  })

  it.each(['starter', 'pro', 'ecommerce'] as const)('%s saves the links, normalized', (plan) => {
    const submitted: WebsiteSchema = {
      ...base(),
      social: {
        instagram: '@glovalai',
        facebook: 'http://facebook.com/insecure',
        x: '   ',
        showInHeader: true,
      },
    }
    const result = enforceSocialPlan(submitted, undefined, plan)
    expect(result.social).toEqual({ instagram: 'https://instagram.com/glovalai', showInHeader: true })
  })

  it('a paid plan that clears everything stores no social value', () => {
    const submitted: WebsiteSchema = { ...base(), social: { instagram: '' } }
    expect('social' in enforceSocialPlan(submitted, stored(), 'starter')).toBe(false)
  })

  it('sanitizeSocial drops invalid networks and returns undefined when empty', () => {
    expect(sanitizeSocial({ instagram: 'javascript:alert(1)' })).toBeUndefined()
    expect(sanitizeSocial('nope')).toBeUndefined()
    expect(sanitizeSocial({ tiktok: '@glovalai' })).toEqual({ tiktok: 'https://tiktok.com/@glovalai' })
  })
})

describe('editor operation updateSocialLinks', () => {
  const site = () => fallbackWebsite('kafe', 'tr')

  it('stores valid values, removes on empty, keeps the old value on invalid', () => {
    const a = applyOperation(site(), {
      op: 'updateSocialLinks',
      patch: { instagram: '@glovalai', facebook: 'glovalai.page' },
      showInHeader: true,
    })
    expect(a.social).toEqual({
      instagram: 'https://instagram.com/glovalai',
      facebook: 'https://facebook.com/glovalai.page',
      showInHeader: true,
    })
    const b = applyOperation(a, {
      op: 'updateSocialLinks',
      patch: { instagram: '', facebook: 'http://facebook.com/x' },
    })
    expect(b.social?.instagram).toBeUndefined()
    expect(b.social?.facebook).toBe('https://facebook.com/glovalai.page')
  })
})

describe('rendered output: contact section, footer, header', () => {
  const withSocial = (): WebsiteSchema => ({
    ...ensureContactSection(fallbackWebsite('diş kliniği', 'tr')),
    social: { instagram: '@glovalai', youtube: '@glovalai', showInHeader: true },
  })
  const without = (): WebsiteSchema => ensureContactSection(fallbackWebsite('diş kliniği', 'tr'))

  const contactHtml = (site: WebsiteSchema) => {
    const section = site.sections.find((s) => s.type === 'contact')
    if (!section || section.type !== 'contact') throw new Error('no contact section')
    return renderToStaticMarkup(createElement(ContactSection, { data: section, lang: 'tr', site }))
  }
  const footerHtml = (site: WebsiteSchema) => {
    const section = site.sections.find((s) => s.type === 'footer')
    if (!section || section.type !== 'footer') throw new Error('no footer section')
    return renderToStaticMarkup(
      createElement(WebsiteFooter, { data: section, logoText: site.navigation.logoText, lang: 'tr', site }),
    )
  }
  const headerHtml = (site: WebsiteSchema) =>
    renderToStaticMarkup(
      createElement(WebsiteHeader, {
        navigation: site.navigation,
        lang: 'tr',
        socialLinks: resolveHeaderSocialLinks(site),
      }),
    )

  it('contact section shows the filled networks only', () => {
    const html = contactHtml(withSocial())
    expect(html).toContain('data-social-links="contact"')
    expect(html).toContain('href="https://instagram.com/glovalai"')
    expect(html).toContain('href="https://youtube.com/@glovalai"')
    expect(html).not.toContain('data-social-network="facebook"')
  })

  it('footer skips the links while a visible contact section already carries them', () => {
    expect(footerHtml(withSocial())).not.toContain('data-social-links="footer"')
  })

  it('footer shows the same links when the contact section is hidden or removed', () => {
    const base = withSocial()
    const hidden: WebsiteSchema = {
      ...base,
      sections: base.sections.map((s) => (s.type === 'contact' ? { ...s, hidden: true } : s)),
    }
    const removed: WebsiteSchema = {
      ...base,
      sections: base.sections.filter((s) => s.type !== 'contact'),
    }
    for (const site of [hidden, removed]) {
      const html = footerHtml(site)
      expect(html).toContain('data-social-links="footer"')
      expect(html).toContain('data-social-network="instagram"')
      expect(html).toContain('data-social-network="youtube"')
    }
  })

  it('header shows the icons only when the switch is on', () => {
    const on = headerHtml(withSocial())
    expect(on).toContain('data-social-links="header"')
    expect(on).toContain('data-social-network="instagram"')

    const off = headerHtml({ ...withSocial(), social: { instagram: '@glovalai' } })
    expect(off).not.toContain('data-social-links')
  })

  it('a site without social data renders none of the three blocks', () => {
    const site = without()
    expect(contactHtml(site)).not.toContain('data-social-links')
    expect(footerHtml(site)).not.toContain('data-social-links')
    expect(headerHtml(site)).not.toContain('data-social-links')
  })
})

describe('older sites without a social field', () => {
  it('still parse and render', () => {
    const legacy = fallbackWebsite('restoran', 'tr') as Record<string, unknown>
    delete legacy.social
    const parsed = websiteSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.social).toBeUndefined()
    expect(resolveSocialLinks(parsed.data)).toEqual([])
    expect(resolveHeaderSocialLinks(parsed.data)).toEqual([])
  })

  it('a stored social object missing newer keys is accepted', () => {
    const site = { ...fallbackWebsite('restoran', 'tr'), social: { instagram: 'glovalai' } }
    expect(websiteSchema.safeParse(site).success).toBe(true)
  })
})
