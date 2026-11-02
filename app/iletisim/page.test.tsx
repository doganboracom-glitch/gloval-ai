import { isValidElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ContactPage from './page'

vi.mock('@/components/legal/contact-page-client', () => ({
  ContactPageClient: () => null,
}))

describe('contact page message prefill', () => {
  it('sanitizes the query message on the server before passing it to the form', async () => {
    const page = await ContactPage({
      searchParams: Promise.resolve({ message: '<b>Web</b> site\u0000 ' }),
    })

    expect(isValidElement(page)).toBe(true)
    expect((page as ReactElement<{ initialMessage: string }>).props.initialMessage).toBe(
      'Web site  ',
    )
  })

  it('ignores repeated message parameters', async () => {
    const page = await ContactPage({
      searchParams: Promise.resolve({ message: ['first', 'second'] }),
    })

    expect((page as ReactElement<{ initialMessage: string }>).props.initialMessage).toBe('')
  })
})
