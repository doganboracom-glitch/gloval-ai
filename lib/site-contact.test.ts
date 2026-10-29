import { describe, expect, it, vi } from 'vitest'
import {
  CONTACT_MIN_FILL_MS,
  CONTACT_RATE,
  CONTACT_TOKEN_MAX_AGE_MS,
  contactFormCopy,
  postContactForm,
  resolveContactFormLayout,
  resolveContactSubmitError,
  validateContactInput,
} from './site-contact-form'
import { isTenantPassthroughPath } from './domains'
import { clientIpFromHeaders, hashContactIp, signContactToken, verifyContactToken } from './site-contact-guard'
import { buildContactEmail } from './site-contact-email'
import { pickContactRecipient, submitSiteContact, type ContactDeps, type ContactSite } from './site-contact-service'

vi.mock('server-only', () => ({}))

const SECRET = 'test-secret'
const SLUG = 'demo-site'
const T0 = 1_800_000_000_000

const validBody = {
  name: 'Ayşe Yılmaz',
  email: 'Ayse@Example.com',
  phone: '+90 532 123 45 67',
  message: 'Merhaba, fiyat teklifi almak istiyorum.',
  consent: true,
}

describe('validateContactInput', () => {
  it('normalizes a valid submission', () => {
    const result = validateContactInput(validBody)
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Ayşe Yılmaz',
        email: 'ayse@example.com',
        phone: '+90 532 123 45 67',
        message: 'Merhaba, fiyat teklifi almak istiyorum.',
      },
    })
  })

  it('treats phone as optional', () => {
    const result = validateContactInput({ ...validBody, phone: '' })
    expect(result.ok && result.value.phone).toBeNull()
  })

  it('requires explicit boolean consent', () => {
    for (const consent of [undefined, false, 'true', 1]) {
      const result = validateContactInput({ ...validBody, consent })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.consent).toBe('required')
    }
  })

  it('rejects HTML-like content but allows a lone "<"', () => {
    const html = validateContactInput({ ...validBody, message: 'Merhaba <script>alert(1)</script>' })
    expect(!html.ok && html.errors.message).toBe('html')
    const name = validateContactInput({ ...validBody, name: '<b>Ayşe</b>' })
    expect(!name.ok && name.errors.name).toBe('html')
    expect(validateContactInput({ ...validBody, message: 'Fiyat 3 < 5 olursa alırım.' }).ok).toBe(true)
  })

  it('checks lengths, email and phone', () => {
    const result = validateContactInput({
      name: 'A',
      email: 'not-an-email',
      phone: 'abc',
      message: 'kısa',
      consent: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toEqual({
        name: 'too_short',
        email: 'invalid',
        phone: 'invalid',
        message: 'too_short',
      })
    }
    const long = validateContactInput({ ...validBody, message: 'a'.repeat(2001) })
    expect(!long.ok && long.errors.message).toBe('too_long')
  })

  it('rejects header-injection style e-mail values', () => {
    const result = validateContactInput({ ...validBody, email: 'a@b.com\r\nBcc: evil@x.com' })
    expect(result.ok).toBe(false)
  })

  it('survives non-object input', () => {
    for (const raw of [null, undefined, 'x', 42, []]) expect(validateContactInput(raw).ok).toBe(false)
  })
})

describe('resolveContactFormLayout', () => {
  it('reuses owner labels and shows phone only when asked', () => {
    expect(resolveContactFormLayout(['Ad Soyad', 'E-posta', 'Mesaj'], 'tr').phone).toBeNull()
    const layout = resolveContactFormLayout(['Adınız', 'Telefon', 'E-posta', 'Mesajınız'], 'tr')
    expect(layout).toEqual({ name: 'Adınız', email: 'E-posta', phone: 'Telefon', message: 'Mesajınız' })
  })

  it('falls back to language defaults', () => {
    expect(resolveContactFormLayout(undefined, 'en')).toEqual({
      name: 'Name',
      email: 'Email',
      phone: null,
      message: 'Message',
    })
    expect(resolveContactFormLayout([], 'tr').name).toBe('Ad Soyad')
  })
})

describe('contact token', () => {
  it('accepts a token that waited long enough', () => {
    const token = signContactToken(SECRET, SLUG, T0)
    expect(verifyContactToken(SECRET, SLUG, token, T0 + CONTACT_MIN_FILL_MS)).toBe('ok')
  })

  it('flags too-fast and expired submissions', () => {
    const token = signContactToken(SECRET, SLUG, T0)
    expect(verifyContactToken(SECRET, SLUG, token, T0 + 500)).toBe('too_fast')
    expect(verifyContactToken(SECRET, SLUG, token, T0 + CONTACT_TOKEN_MAX_AGE_MS + 1)).toBe('expired')
  })

  it('rejects tampering, another site and another secret', () => {
    const token = signContactToken(SECRET, SLUG, T0)
    const now = T0 + 10_000
    expect(verifyContactToken(SECRET, 'other-site', token, now)).toBe('invalid')
    expect(verifyContactToken('other-secret', SLUG, token, now)).toBe('invalid')
    const [issued, sig] = token.split('.')
    expect(verifyContactToken(SECRET, SLUG, `${Number(issued) - 60_000}.${sig}`, now)).toBe('invalid')
    for (const bad of [undefined, null, 42, '', 'abc', `${issued}.`, `${issued}.${sig}.x`]) {
      expect(verifyContactToken(SECRET, SLUG, bad, now)).toBe('invalid')
    }
  })
})

describe('tenant host routing', () => {
  it('serves the contact API as-is on tenant hosts instead of rewriting it to /site/<slug>/api', () => {
    expect(isTenantPassthroughPath('/api/site-contact')).toBe(true)
    expect(isTenantPassthroughPath('/api/store/session')).toBe(true)
    expect(isTenantPassthroughPath('/api/try-on')).toBe(true)
  })

  it('does not expose the rest of /api on tenant hosts', () => {
    for (const path of [
      '/api/generate',
      '/api/site-contact/extra',
      '/api/try-on/',
      '/api/try-on/extra',
      '/api/edit',
      '/api/cron/domain-reconciliation',
      '/api/billing/plan',
      '/api/admin/domains/detach-unbound',
      '/api/store/payment-return/iyzico/x',
    ]) {
      expect(isTenantPassthroughPath(path)).toBe(false)
    }
  })
})

describe('contact submit error messages', () => {
  it('maps every API error code to its own Turkish message', () => {
    const copy = contactFormCopy('tr')
    const messages = new Set<string>()
    for (const error of ['too_fast', 'rate_limited', 'expired', 'invalid_token', 'unknown_site', 'too_large', 'server']) {
      const key = resolveContactSubmitError({ error })
      expect(key).toBe(error)
      messages.add(copy.submitErrors[key])
    }
    expect(messages.size).toBe(7)
    expect(copy.submitErrors.too_fast).toContain('çok hızlı')
    expect(copy.submitErrors.rate_limited).toContain('Çok fazla deneme')
  })

  it('treats unknown or missing bodies as a server error', () => {
    for (const body of [null, undefined, 'x', {}, { error: 'nope' }]) {
      expect(resolveContactSubmitError(body)).toBe('server')
    }
  })

  it('tells the visitor the message was received', () => {
    expect(contactFormCopy('tr').success).toContain('alındı')
  })
})

describe('postContactForm', () => {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('posts to the relative same-origin route and reports success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ ok: true }, 200))
    await expect(postContactForm({ a: 1 }, fetchImpl)).resolves.toEqual({ kind: 'sent' })
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/site-contact')
  })

  it('treats a 2xx with an unreadable body as success, never as a network error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(postContactForm({}, fetchImpl)).resolves.toEqual({ kind: 'sent' })
  })

  it('reports a network error only when fetch itself rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(postContactForm({}, fetchImpl)).resolves.toEqual({ kind: 'error', error: 'network' })
  })

  it('maps an unparseable error body to a server error and 422 to field errors', async () => {
    const bad = vi.fn().mockResolvedValue(new Response('oops', { status: 503 }))
    await expect(postContactForm({}, bad)).resolves.toEqual({ kind: 'error', error: 'server' })
    const invalid = vi.fn().mockResolvedValue(json({ error: 'validation', fields: { email: 'invalid' } }, 422))
    await expect(postContactForm({}, invalid)).resolves.toEqual({ kind: 'validation', fields: { email: 'invalid' } })
    const blocked = vi.fn().mockResolvedValue(json({ error: 'rate_limited' }, 429))
    await expect(postContactForm({}, blocked)).resolves.toEqual({ kind: 'error', error: 'rate_limited' })
  })
})

describe('ip helpers', () => {
  it('hashes without exposing the address and is stable', () => {
    const hash = hashContactIp(SECRET, '203.0.113.7')
    expect(hash).toBe(hashContactIp(SECRET, '203.0.113.7'))
    expect(hash).not.toContain('203')
    expect(hash).not.toBe(hashContactIp(SECRET, '203.0.113.8'))
  })

  it('reads the first forwarded hop', () => {
    const headers = (map: Record<string, string>) => ({ get: (k: string) => map[k] ?? null })
    expect(clientIpFromHeaders(headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1')
    expect(clientIpFromHeaders(headers({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3')
    expect(clientIpFromHeaders(headers({}))).toBe('unknown')
  })
})

describe('buildContactEmail', () => {
  it('escapes visitor markup and keeps line breaks', () => {
    const mail = buildContactEmail({
      siteName: 'Nakliyat\r\nBcc: x@y.com',
      lang: 'tr',
      name: '<img src=x onerror=alert(1)>',
      email: 'a@b.com',
      phone: null,
      message: 'satır 1\n<script>alert(1)</script>',
    })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).not.toContain('<img src=x')
    expect(mail.html).toContain('&lt;script&gt;')
    expect(mail.html).toContain('<br>')
    expect(mail.subject).not.toMatch(/[\r\n]/)
    expect(mail.subject).toContain('Nakliyat')
    expect(mail.text).toContain('satır 1')
  })

  it('links the button and plain text to the real, absolute messages page', () => {
    for (const lang of ['tr', 'en'] as const) {
      const mail = buildContactEmail({ siteName: 'Shop', lang, name: 'Jo', email: 'jo@x.com', phone: null, message: 'Hello there, friend.' })
      expect(mail.html).toContain('href="https://gloval.ai/dashboard/messages"')
      expect(mail.text).toContain('https://gloval.ai/dashboard/messages')
      expect(mail.html).not.toContain('mesajlar')
      expect(mail.text).not.toContain('mesajlar')
    }
  })

  it('omits the phone row when none was given and supports English', () => {
    const mail = buildContactEmail({
      siteName: 'Shop',
      lang: 'en',
      name: 'Jo',
      email: 'jo@x.com',
      phone: null,
      message: 'Hello there, friend.',
    })
    expect(mail.subject).toBe('New message through your site Shop')
    expect(mail.text).not.toContain('Phone:')
  })
})

describe('pickContactRecipient', () => {
  it('prefers the explicit recipient, then the contact e-mail, then the owner', () => {
    expect(pickContactRecipient({ recipientEmail: 'A@x.com', contactEmail: 'b@x.com', ownerEmail: 'c@x.com' })).toBe('a@x.com')
    expect(pickContactRecipient({ recipientEmail: 'bad', contactEmail: 'b@x.com', ownerEmail: 'c@x.com' })).toBe('b@x.com')
    expect(pickContactRecipient({ recipientEmail: null, contactEmail: null, ownerEmail: 'c@x.com' })).toBe('c@x.com')
    expect(pickContactRecipient({ recipientEmail: null, contactEmail: null, ownerEmail: null })).toBeNull()
  })
})

const site: ContactSite = {
  projectId: 'p1',
  ownerId: 'o1',
  name: 'Demo',
  lang: 'tr',
  contactEmail: null,
  recipientEmail: null,
}

function makeDeps(overrides: Partial<ContactDeps> = {}): ContactDeps {
  return {
    now: () => T0 + 10_000,
    secret: () => SECRET,
    loadSite: vi.fn(async () => site),
    ownerEmail: vi.fn(async () => 'owner@example.com'),
    countRecent: vi.fn(async () => 0),
    insert: vi.fn(async () => ({ id: 'm1' })),
    setEmailStatus: vi.fn(async () => {}),
    sendEmail: vi.fn(async () => true),
    rateLimit: vi.fn(() => ({ allowed: true })),
    ...overrides,
  }
}

const goodInput = () => ({
  slug: SLUG,
  ip: '203.0.113.7',
  body: { ...validBody, token: signContactToken(SECRET, SLUG, T0) },
})

describe('submitSiteContact', () => {
  it('stores the message, e-mails the owner and records the status', async () => {
    const deps = makeDeps()
    expect(await submitSiteContact(goodInput(), deps)).toEqual({ ok: true })
    expect(deps.insert).toHaveBeenCalledTimes(1)
    expect(deps.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', replyTo: 'ayse@example.com' }),
    )
    expect(deps.setEmailStatus).toHaveBeenCalledWith('m1', 'sent')
  })

  it('fails closed without a secret', async () => {
    const deps = makeDeps({ secret: () => null })
    expect(await submitSiteContact(goodInput(), deps)).toEqual({ ok: false, kind: 'unavailable', code: 'E_NO_SECRET' })
    expect(deps.insert).not.toHaveBeenCalled()
  })

  it('answers a filled honeypot with success but stores nothing', async () => {
    const deps = makeDeps()
    const input = goodInput()
    expect(await submitSiteContact({ ...input, body: { ...input.body, website: 'http://spam' } }, deps)).toEqual({ ok: true })
    expect(deps.insert).not.toHaveBeenCalled()
    expect(deps.sendEmail).not.toHaveBeenCalled()
  })

  it('blocks missing, forged and too-fast tokens', async () => {
    const deps = makeDeps()
    const input = goodInput()
    expect(await submitSiteContact({ ...input, body: { ...input.body, token: undefined } }, deps)).toEqual({ ok: false, kind: 'blocked', reason: 'invalid_token' })
    expect(await submitSiteContact({ ...input, slug: 'another' }, deps)).toEqual({ ok: false, kind: 'blocked', reason: 'invalid_token' })
    const fast = makeDeps({ now: () => T0 + 100 })
    expect(await submitSiteContact(input, fast)).toEqual({ ok: false, kind: 'blocked', reason: 'too_fast' })
    expect(deps.insert).not.toHaveBeenCalled()
  })

  it('tells a too-fast submission apart from an expired form', async () => {
    const input = goodInput()
    const justUnder = makeDeps({ now: () => T0 + CONTACT_MIN_FILL_MS - 1 })
    expect(await submitSiteContact(input, justUnder)).toEqual({ ok: false, kind: 'blocked', reason: 'too_fast' })
    const justOver = makeDeps({ now: () => T0 + CONTACT_MIN_FILL_MS })
    expect(await submitSiteContact(input, justOver)).toEqual({ ok: true })
    const stale = makeDeps({ now: () => T0 + CONTACT_TOKEN_MAX_AGE_MS + 1 })
    expect(await submitSiteContact(input, stale)).toEqual({ ok: false, kind: 'blocked', reason: 'expired' })
  })

  it('accepts the form on a tenant host: the slug, not the host, is what the token is bound to', async () => {
    const deps = makeDeps()
    const body = { ...validBody, token: signContactToken(SECRET, 'luna-mucevher', T0) }
    expect(await submitSiteContact({ slug: 'Luna-Mucevher', ip: '203.0.113.7', body }, deps)).toEqual({ ok: true })
    expect(deps.loadSite).toHaveBeenCalledWith('luna-mucevher')
  })

  it('returns field errors for invalid input without touching the database', async () => {
    const deps = makeDeps()
    const input = goodInput()
    const result = await submitSiteContact({ ...input, body: { ...input.body, consent: false } }, deps)
    expect(result).toEqual({ ok: false, kind: 'validation', errors: { consent: 'required' } })
    expect(deps.loadSite).not.toHaveBeenCalled()
  })

  it('blocks unknown sites and exceeded limits', async () => {
    const unknown = makeDeps({ loadSite: vi.fn(async () => null) })
    expect(await submitSiteContact(goodInput(), unknown)).toEqual({ ok: false, kind: 'blocked', reason: 'unknown_site' })

    const limited = makeDeps({ rateLimit: vi.fn(() => ({ allowed: false })) })
    expect(await submitSiteContact(goodInput(), limited)).toEqual({ ok: false, kind: 'blocked', reason: 'rate_limited' })

    const ipFlood = makeDeps({ countRecent: vi.fn(async (f) => (f.ipHash ? CONTACT_RATE.perHour : 0)) })
    expect(await submitSiteContact(goodInput(), ipFlood)).toEqual({ ok: false, kind: 'blocked', reason: 'rate_limited' })

    const siteFlood = makeDeps({ countRecent: vi.fn(async (f) => (f.projectId ? CONTACT_RATE.siteDaily : 0)) })
    expect(await submitSiteContact(goodInput(), siteFlood)).toEqual({ ok: false, kind: 'blocked', reason: 'rate_limited' })
    expect(siteFlood.insert).not.toHaveBeenCalled()
  })

  it('reports a stage code when the database fails, and only fails when nothing was stored', async () => {
    const insertNull = makeDeps({ insert: vi.fn(async () => null) })
    expect(await submitSiteContact(goodInput(), insertNull)).toEqual({ ok: false, kind: 'unavailable', code: 'E_INSERT' })
    expect(insertNull.sendEmail).not.toHaveBeenCalled()

    const insertThrows = makeDeps({
      insert: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    expect(await submitSiteContact(goodInput(), insertThrows)).toEqual({ ok: false, kind: 'unavailable', code: 'E_INSERT' })

    const loadThrows = makeDeps({
      loadSite: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    expect(await submitSiteContact(goodInput(), loadThrows)).toEqual({ ok: false, kind: 'unavailable', code: 'E_LOAD_SITE' })

    const countThrows = makeDeps({
      countRecent: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    expect(await submitSiteContact(goodInput(), countThrows)).toEqual({ ok: false, kind: 'unavailable', code: 'E_RATE_COUNT' })
  })

  it('still succeeds, with the message stored, when e-mail sending fails', async () => {
    const deps = makeDeps({ sendEmail: vi.fn(async () => false) })
    expect(await submitSiteContact(goodInput(), deps)).toEqual({ ok: true })
    expect(deps.insert).toHaveBeenCalledTimes(1)
    expect(deps.setEmailStatus).toHaveBeenCalledWith('m1', 'failed')
  })

  it('keeps the stored message when e-mail fails or throws', async () => {
    const failed = makeDeps({ sendEmail: vi.fn(async () => false) })
    expect(await submitSiteContact(goodInput(), failed)).toEqual({ ok: true })
    expect(failed.setEmailStatus).toHaveBeenCalledWith('m1', 'failed')

    const thrown = makeDeps({
      sendEmail: vi.fn(async () => {
        throw new Error('smtp down')
      }),
      setEmailStatus: vi.fn(async () => {
        throw new Error('db down')
      }),
    })
    expect(await submitSiteContact(goodInput(), thrown)).toEqual({ ok: true })
  })

  it('marks the status skipped when no recipient exists', async () => {
    const deps = makeDeps({ ownerEmail: vi.fn(async () => null) })
    expect(await submitSiteContact(goodInput(), deps)).toEqual({ ok: true })
    expect(deps.sendEmail).not.toHaveBeenCalled()
    expect(deps.setEmailStatus).toHaveBeenCalledWith('m1', 'skipped')
  })

  it('does not look up the owner when the site already has a usable recipient', async () => {
    const deps = makeDeps({ loadSite: vi.fn(async () => ({ ...site, contactEmail: 'info@demo.com' })) })
    await submitSiteContact(goodInput(), deps)
    expect(deps.ownerEmail).not.toHaveBeenCalled()
    expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'info@demo.com' }))
  })
})
