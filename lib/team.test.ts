import { describe, expect, it } from 'vitest'
import {
  clampName,
  clampRole,
  initialsOf,
  isValidPhone,
  memberSocials,
  resolveTeamPortrait,
  safeSocialHref,
  sanitizePhone,
  telHref,
} from '@/lib/team'

describe('team phone', () => {
  it('strips disallowed characters and caps at 20', () => {
    expect(sanitizePhone('+90 (532) abc 123-45-67')).toBe('+90 (532)  123-45-67')
    expect(sanitizePhone('1'.repeat(40))).toHaveLength(20)
  })
  it('validates and builds a tel link', () => {
    expect(isValidPhone('+90 532 123 45 67')).toBe(true)
    expect(isValidPhone('12')).toBe(false)
    expect(isValidPhone('abc')).toBe(false)
    expect(telHref('+90 (532) 123-45-67')).toBe('tel:+905321234567')
    expect(telHref('')).toBeNull()
  })
})

describe('team social links', () => {
  it('accepts https links on the platform host', () => {
    expect(safeSocialHref('instagram', 'https://www.instagram.com/ada')).toBe('https://www.instagram.com/ada')
    expect(safeSocialHref('x', 'twitter.com/ada')).toBe('https://twitter.com/ada')
    expect(safeSocialHref('linkedin', 'https://tr.linkedin.com/in/ada')).toBe('https://tr.linkedin.com/in/ada')
  })
  it('rejects look-alike hosts, http and script schemes', () => {
    expect(safeSocialHref('x', 'https://x.com.evil.com/a')).toBeNull()
    expect(safeSocialHref('x', 'https://x.com@evil.com/a')).toBeNull()
    expect(safeSocialHref('facebook', 'http://facebook.com/a')).toBeNull()
    expect(safeSocialHref('facebook', 'javascript:alert(1)')).toBeNull()
    expect(safeSocialHref('instagram', 'https://facebook.com/a')).toBeNull()
    expect(safeSocialHref('instagram', `https://instagram.com/${'a'.repeat(200)}`)).toBeNull()
  })
  it('turns an email into mailto and rejects junk', () => {
    expect(safeSocialHref('email', 'ada@example.com')).toBe('mailto:ada@example.com')
    expect(safeSocialHref('email', 'not an email')).toBeNull()
  })
  it('lists only valid links in fixed order', () => {
    const links = memberSocials({ social: { email: 'a@b.co', facebook: 'https://facebook.com/a', x: 'bad' } })
    expect(links.map((l) => l.key)).toEqual(['facebook', 'email'])
  })
})

describe('team portrait and limits', () => {
  it('prefers the photo, otherwise an avatar by position', () => {
    expect(resolveTeamPortrait({ src: '/p.png' }, 0).kind).toBe('photo')
    const a = resolveTeamPortrait({}, 0)
    const b = resolveTeamPortrait({}, 1)
    expect(a.kind).toBe('avatar')
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
  it('clamps name/role and builds initials', () => {
    expect(clampName('a'.repeat(80))).toHaveLength(50)
    expect(clampRole('a'.repeat(80))).toHaveLength(40)
    expect(initialsOf('ayşe demir')).toBe('AD')
  })
})
