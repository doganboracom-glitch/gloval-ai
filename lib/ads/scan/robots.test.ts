import { describe, expect, it } from 'vitest'
import { ALLOW_ALL, DISALLOW_ALL, headerForbidsUse, matchRobotsPattern, parseRobots } from './robots'

describe('matchRobotsPattern', () => {
  it.each([
    ['/', '/anything', true],
    ['/admin', '/admin', true],
    ['/admin', '/administrator', true],
    ['/admin', '/other', false],
    ['/*.pdf', '/files/a.pdf', true],
    ['/*.pdf$', '/files/a.pdf', true],
    ['/*.pdf$', '/files/a.pdf?x=1', false],
    ['/a/*/c', '/a/b/c', true],
    ['/a/*/c', '/a/b/d', false],
    ['/exact$', '/exact', true],
    ['/exact$', '/exact/more', false],
    ['/*', '/x', true],
    ['/*$', '/x', true],
  ])('%s vs %s -> %s', (pattern, path, expected) => {
    expect(matchRobotsPattern(pattern, path)).toBe(expected)
  })

  it('does not backtrack catastrophically on a hostile pattern', () => {
    const pattern = `/${'a*'.repeat(500)}b`
    const started = Date.now()
    expect(matchRobotsPattern(pattern, `/${'a'.repeat(5000)}`)).toBe(false)
    expect(Date.now() - started).toBeLessThan(500)
  })
})

describe('parseRobots', () => {
  it('allows everything when no rule applies', () => {
    expect(parseRobots('').isAllowed('/')).toBe(true)
    expect(parseRobots('Sitemap: https://x.com/s.xml').isAllowed('/a')).toBe(true)
  })

  it('applies the * group to a bot that has no group of its own', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /private/')
    expect(rules.isAllowed('/private/a')).toBe(false)
    expect(rules.isAllowed('/public')).toBe(true)
  })

  it('prefers the group that names this scanner over the * group', () => {
    const rules = parseRobots(
      ['User-agent: *', 'Disallow: /', '', 'User-agent: GlovalAdsBot', 'Disallow: /secret'].join('\n'),
    )
    expect(rules.isAllowed('/')).toBe(true)
    expect(rules.isAllowed('/secret/x')).toBe(false)
  })

  it('honours a group that blocks this scanner entirely', () => {
    const rules = parseRobots('User-agent: GlovalAdsBot/1.0\nDisallow: /')
    expect(rules.isAllowed('/')).toBe(false)
  })

  it('treats an empty Disallow as allow-all', () => {
    expect(parseRobots('User-agent: *\nDisallow:').isAllowed('/x')).toBe(true)
  })

  it('lets the longest matching rule win and Allow win a tie', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /docs\nAllow: /docs/public')
    expect(rules.isAllowed('/docs/private')).toBe(false)
    expect(rules.isAllowed('/docs/public/a')).toBe(true)
    const tie = parseRobots('User-agent: *\nDisallow: /same\nAllow: /same')
    expect(tie.isAllowed('/same')).toBe(true)
  })

  it('groups consecutive User-agent lines and ignores comments, case and CRLF', () => {
    const rules = parseRobots('# hi\r\nUSER-AGENT: foo\r\nuser-agent: glovaladsbot # us\r\nDISALLOW: /x # no\r\n')
    expect(rules.isAllowed('/x')).toBe(false)
    expect(rules.isAllowed('/y')).toBe(true)
  })

  it('ignores rules that appear before any User-agent line', () => {
    expect(parseRobots('Disallow: /\nUser-agent: other\nDisallow: /x').isAllowed('/')).toBe(true)
  })

  it('matches against path plus query', () => {
    expect(parseRobots('User-agent: *\nDisallow: /*?session=').isAllowed('/a?session=1')).toBe(false)
  })

  it('exposes the allow-all and disallow-all constants the fetcher uses for 4xx / 5xx', () => {
    expect(ALLOW_ALL.isAllowed('/x')).toBe(true)
    expect(DISALLOW_ALL.isAllowed('/')).toBe(false)
  })

  it('parses a very large hostile file without hanging', () => {
    const started = Date.now()
    parseRobots(`User-agent: *\n${'Disallow: /a*a*a*a*a*b\n'.repeat(50_000)}`).isAllowed('/aaaaaaaaaaaaaaaaaaaaaaaa')
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('headerForbidsUse (X-Robots-Tag)', () => {
  it.each([
    ['noindex', true],
    ['none', true],
    ['noai', true],
    ['NoIndex, nofollow', true],
    ['nofollow', false],
    ['index, follow', false],
    ['glovaladsbot: noindex', true],
    ['googlebot: noindex', false],
    ['otherbot: noindex, nofollow', false],
    ['otherbot: noindex, glovaladsbot: noai', true],
    ['*: noindex', true],
    ['', false],
    [null, false],
  ])('%j -> %s', (value, expected) => {
    expect(headerForbidsUse(value)).toBe(expected)
  })
})
