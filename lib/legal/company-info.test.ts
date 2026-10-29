import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { fallbackWebsite } from '@/lib/website-schema'
import { mailSetupFooter, renderEmailPlainText } from '@/lib/email/layout'

const APPROVED = {
  legalName:
    'DB AJANS REKLAM MEDYA HİZMETLER BİLİŞİM TEKNOLOJİLERİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ',
  address: 'Meşrutiyet Mah. Şehit İsmet Armağan Sk. Bingül Apt. No:17/A Şişli/İstanbul',
  shortName: 'GLOVAL AI',
}

const OLD_PATTERNS: RegExp[] = [
  /Sümbül Efendi/i,
  /Hamdullah/i,
  /Tuncay Apt/i,
  /0542[\s.-]?464[\s.-]?76[\s.-]?10/,
  /5424647610/,
  /HİZMETLERİ BİLİŞİM/,
  /Osman Doğan/i,
  /Osman Dogan/i,
  /BASTIRMACI/i,
]

const ROOT = process.cwd()
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.v0', 'coverage', 'user_read_only_context'])
const TEXT_EXT = /\.(tsx?|jsx?|mjs|cjs|json|md|mdx|css|html|sql|txt|ya?ml)$/

/**
 * Files allowed to contain an old value. Keep this list short and justified:
 * - this file defines the old patterns it searches for;
 * - the billing phone test uses 0542 464 76 10 as an arbitrary valid mobile
 *   number to exercise the +90 normaliser; it is unrelated to company data;
 * - the lockfile is generated and may carry arbitrary hashes.
 */
const EXCLUDED = new Set([
  'lib/legal/company-info.test.ts',
  'lib/billing-profile-validation.test.ts',
  'pnpm-lock.yaml',
  'package-lock.json',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (TEXT_EXT.test(name)) out.push(full)
  }
  return out
}

async function loadCompany() {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_COMPANY_LEGAL_NAME', '')
  vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', '')
  vi.stubEnv('NEXT_PUBLIC_COMPANY_PHONE', '')
  return import('@/lib/legal/company')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('approved company details', () => {
  it('ships the approved legal name and address without a default phone', async () => {
    const { COMPANY } = await loadCompany()
    expect(COMPANY.legalName).toBe(APPROVED.legalName)
    expect(COMPANY.address).toBe(APPROVED.address)
    expect(COMPANY.phone).toBeUndefined()
    expect(COMPANY.brandName).toBe(APPROVED.shortName)
  })

  it('shows the short name definition next to the legal name in the KVKK and sales texts', async () => {
    const { LEGAL_DOCS } = await import('@/lib/legal/documents')
    const text = JSON.stringify(LEGAL_DOCS)
    expect(text).toContain(`${APPROVED.legalName} (bundan sonra “GLOVAL AI” olarak anılacaktır)`)
    expect(text).toContain(`${APPROVED.legalName} (hereinafter referred to as “GLOVAL AI”)`)
    expect(text).toContain(APPROVED.address)
    expect(text).not.toMatch(/(?:Telefon|Phone):/)
  })
})

describe('JSON-LD Organization and e-mail footers', () => {
  it('home page Organization declares only the brand, no legal name/address/phone', () => {
    const src = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8')
    const org = src.slice(src.indexOf("'@type': 'Organization'"), src.indexOf("'@type': 'WebSite'"))
    expect(org).toContain("name: 'GLOVAL AI'")
    expect(org).not.toMatch(/telephone|streetAddress|legalName|DB AJANS/)
  })

  it('e-mail footers use the GLOVAL AI brand and carry no company data', () => {
    const tr = mailSetupFooter('tr', 'info@ornek.com')
    const en = mailSetupFooter('en', 'info@ornek.com')
    const plain = renderEmailPlainText('Başlık', 'İçerik', tr)
    for (const s of [tr, en, plain]) {
      expect(s).toContain('GLOVAL AI')
      expect(s).not.toContain('DB AJANS')
      for (const re of OLD_PATTERNS) expect(s).not.toMatch(re)
    }
  })
})

describe('no stale company data left in the repository', () => {
  it('finds no old address, phone, title spelling or personal name in tracked sources', () => {
    const hits: string[] = []
    for (const file of walk(ROOT)) {
      const rel = relative(ROOT, file).split(sep).join('/')
      if (EXCLUDED.has(rel)) continue
      const content = readFileSync(file, 'utf8')
      for (const re of OLD_PATTERNS) {
        if (re.test(content)) hits.push(`${rel}: ${re}`)
      }
    }
    expect(hits).toEqual([])
  })
})

describe('customer sites are independent of the company details', () => {
  it('the published renderer and tenant routes never import the legal company module', () => {
    const offenders: string[] = []
    for (const dir of ['components/website-renderer', 'app/site']) {
      for (const file of walk(join(ROOT, dir))) {
        const src = readFileSync(file, 'utf8')
        if (/lib\/legal\/(company|documents)/.test(src)) offenders.push(relative(ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('renders identical HTML whatever the company env says, with none of the company data', async () => {
    const render = () =>
      renderToStaticMarkup(
        createElement(WebsiteRenderer, {
          site: fallbackWebsite('kahve dükkanı ve atölye', 'tr'),
          pageRouting: true,
          initialPage: null,
        }),
      )
    const before = render()
    vi.stubEnv('NEXT_PUBLIC_COMPANY_LEGAL_NAME', 'BAŞKA ŞİRKET A.Ş.')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_ADDRESS', 'Başka Mah. Başka Sk. No:1')
    vi.stubEnv('NEXT_PUBLIC_COMPANY_PHONE', '0212 000 00 00')
    const after = render()
    expect(after).toBe(before)
    for (const value of [APPROVED.legalName, APPROVED.address]) {
      expect(before).not.toContain(value)
    }
    expect(before).not.toMatch(/(?:Telefon|Phone):/)
    for (const re of OLD_PATTERNS) expect(before).not.toMatch(re)
  })
})
