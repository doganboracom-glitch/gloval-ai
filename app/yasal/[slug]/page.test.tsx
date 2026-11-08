import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { COMPANY } from '@/lib/legal/company'
import { ORGANIZATION_DATA } from '@/lib/legal/organization'
import LegalPage from './page'

describe('about page Organization JSON-LD', () => {
  it('renders complete official company details in the server route output', async () => {
    const page = await LegalPage({ params: Promise.resolve({ slug: 'hakkimizda' }) })
    const children = Children.toArray(
      (page as ReactElement<{ children: ReactNode }>).props.children,
    )
    const script = children.find(
      (child): child is ReactElement<{ dangerouslySetInnerHTML: { __html: string } }> =>
        isValidElement(child) && child.type === 'script',
    )

    expect(script).toBeDefined()
    const structuredData = JSON.parse(script!.props.dangerouslySetInnerHTML.__html)

    expect(structuredData).toMatchObject({
      '@context': 'https://schema.org',
      ...ORGANIZATION_DATA,
      legalName: COMPANY.legalName,
      taxID: COMPANY.taxNumber,
      email: COMPANY.supportEmail,
    })
  })

  it('does not add Organization JSON-LD to unrelated legal pages', async () => {
    const page = await LegalPage({
      params: Promise.resolve({ slug: 'gizlilik-politikasi' }),
    })
    const children = Children.toArray(
      (page as ReactElement<{ children: ReactNode }>).props.children,
    )

    expect(children.some((child) => isValidElement(child) && child.type === 'script')).toBe(false)
  })
})
