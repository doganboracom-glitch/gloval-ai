// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { canManageProducts } from '@/lib/site-kind'
import type { ProjectListItem } from '@/lib/projects'

// Every translation key resolves to its own path, so the test never depends on copy.
const tree = (path: string): unknown =>
  new Proxy(() => path, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => path : tree(`${path}.${String(key)}`)),
    apply: () => path,
  })

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('@/lib/projects', () => ({ createProject: vi.fn(), deleteProject: vi.fn() }))
vi.mock('@/lib/ecommerce', () => ({ createEcommerceProject: vi.fn() }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ t: tree('t'), lang: 'tr' }) }))
vi.mock('@/components/language-switcher', () => ({ LanguageSwitcher: () => null }))
vi.mock('@/components/brand-logo', () => ({ BrandLogo: () => null }))
vi.mock('@/components/billing/billing-profile-banner', () => ({ BillingProfileBanner: () => null }))
vi.mock('@/components/dashboard/dashboard-quick-links', () => ({ DashboardQuickLinks: () => null }))

afterEach(cleanup)

const project = (id: string, extra: Partial<ProjectListItem>): ProjectListItem =>
  ({
    id,
    name: id,
    sector: null,
    language: 'tr',
    status: 'draft',
    project_type: 'corporate',
    commerce_mode: 'none',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    slug: null,
    published: false,
    ...extra,
  }) as ProjectListItem

function manageLinks(projects: ProjectListItem[]) {
  const { container } = render(<DashboardClient projects={projects} userEmail="a@b.c" planCode={'pro' as never} />)
  return Array.from(container.querySelectorAll('a[href^="/ecommerce/"]')).map((a) => a.getAttribute('href'))
}

describe('dashboard "Ürünleri yönet" button', () => {
  it('shows only on ecommerce and catalog sites, never on a corporate site', () => {
    const links = manageLinks([
      project('corp', { project_type: 'corporate', commerce_mode: 'none' }),
      project('store', { project_type: 'ecommerce', commerce_mode: 'ecommerce' }),
      project('catalog', { project_type: 'corporate', commerce_mode: 'catalog' }),
    ])
    expect(links).toEqual(['/ecommerce/store', '/ecommerce/catalog'])
  })

  it('a corporate site stays hidden even when its draft holds a products section', () => {
    const corp = project('corp', { project_type: 'corporate', commerce_mode: 'none' })
    expect(manageLinks([corp])).toEqual([])
    expect(canManageProducts(corp)).toBe(false)
  })

  it('predicate follows project_type = ecommerce or commerce_mode = catalog', () => {
    expect(canManageProducts({ project_type: 'ecommerce', commerce_mode: 'ecommerce' })).toBe(true)
    expect(canManageProducts({ project_type: 'corporate', commerce_mode: 'catalog' })).toBe(true)
    expect(canManageProducts({ project_type: 'corporate', commerce_mode: 'none' })).toBe(false)
    expect(canManageProducts({ project_type: 'corporate' })).toBe(false)
  })
})
