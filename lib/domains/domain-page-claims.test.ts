import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'

/**
 * The domain search page must not promise anything GLOVAL cannot back up in
 * code. These phrases were explicitly ruled out; this test fails if any of
 * them (in any supported language) shows up in the page copy or components.
 */
const UNVERIFIED_CLAIMS: { name: string; pattern: RegExp; salesOnly?: boolean }[] = [
  { name: '24/7 support', pattern: /7\s*\/\s*24|24\s*\/\s*7|24\s*x\s*7|24\s*saat\s*destek|round[- ]the[- ]clock|24\s*hour/i },
  { name: 'phone support', pattern: /telefon\s*destek|phone\s*support|support\s*by\s*phone|hotline|çağrı\s*merkezi/i },
  // The WHOIS page legitimately shows a domain's DNSSEC state as RDAP data; only a sales promise is ruled out.
  { name: 'DNSSEC', pattern: /dnssec/i, salesOnly: true },
  { name: 'free transfer', pattern: /ücretsiz\s*(taşıma|transfer)|free\s*(domain\s*)?transfer|kostenlos\w*\s*transfer|transfert\s*gratuit/i },
  { name: 'guarantee', pattern: /money[- ]back|geri\s*ödeme\s*garanti|iade\s*garanti|memnuniyet\s*garanti/i },
]

type Tree = { [key: string]: string | Tree }

function strings(node: Tree, path: string, out: [string, string][] = []): [string, string][] {
  for (const [key, value] of Object.entries(node ?? {})) {
    if (typeof value === 'string') out.push([`${path}.${key}`, value])
    else if (value && typeof value === 'object') strings(value, `${path}.${key}`, out)
  }
  return out
}

describe('domain search page copy makes no unverified promises', () => {
  for (const claim of UNVERIFIED_CLAIMS) {
    it(`has no "${claim.name}" claim in any language`, () => {
      const hits: string[] = []
      for (const locale of SUPPORTED_LOCALES) {
        const dict = dictionary[locale] as unknown as { domainSearch: Tree; whois: Tree }
        for (const section of (claim.salesOnly ? ['domainSearch'] : ['domainSearch', 'whois']) as ('domainSearch' | 'whois')[]) {
          for (const [path, text] of strings(dict[section], `${locale}.${section}`)) {
            if (claim.pattern.test(text)) hits.push(`${path}: ${text.slice(0, 80)}`)
          }
        }
      }
      expect(hits).toEqual([])
    })
  }

  it('has no such claim hard-coded in the page components either', () => {
    const root = join(__dirname, '..', '..')
    const dirs = ['components/domains', 'components/whois', 'app/alan-adi-sorgula', 'app/whois']
    const hits: string[] = []
    for (const dir of dirs) {
      for (const file of readdirSync(join(root, dir), { recursive: true }) as string[]) {
        if (!/\.(tsx?|mdx?)$/.test(file) || /\.test\./.test(file)) continue
        const source = readFileSync(join(root, dir, file), 'utf8')
        for (const claim of UNVERIFIED_CLAIMS) {
          if (claim.salesOnly && dir.includes('whois')) continue
          if (claim.pattern.test(source)) hits.push(`${dir}/${file}: ${claim.name}`)
        }
      }
    }
    expect(hits).toEqual([])
  })
})
