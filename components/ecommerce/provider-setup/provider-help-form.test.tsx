// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProviderHelpForm } from '@/components/ecommerce/provider-setup/provider-help-form'
import type { ProviderSetupConfig, ProviderSetupOverview } from '@/lib/payment-providers/types'

afterEach(() => cleanup())

const config = { help: { submit: async () => ({ ok: true }), errors: {} } } as unknown as ProviderSetupConfig
const overview = {
  siteUrl: 'https://example.gloval.site',
  help: { enabled: true, prefill: { name: '', email: '', phone: '' } },
} as unknown as ProviderSetupOverview

function renderForm(collapsedByDefault?: boolean) {
  return render(
    <ProviderHelpForm
      config={config}
      projectId="p1"
      overview={overview}
      lang="tr"
      collapsedByDefault={collapsedByDefault}
    />,
  )
}

describe('ProviderHelpForm visibility', () => {
  it('is collapsed behind a link while the Instant form is visible', () => {
    renderForm(true)
    expect(screen.queryByText('Başvuruda yardım ister misin?')).toBeNull()
    expect(screen.getByRole('button', { name: 'Yardım gerekirse' })).toBeTruthy()
  })

  it('opens from the link', () => {
    renderForm(true)
    fireEvent.click(screen.getByRole('button', { name: 'Yardım gerekirse' }))
    expect(screen.getByText('Başvuruda yardım ister misin?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Yardım gerekirse' })).toBeNull()
  })

  it('stays open when the Instant form is not visible', () => {
    renderForm(false)
    expect(screen.getByText('Başvuruda yardım ister misin?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Yardım gerekirse' })).toBeNull()
  })

  it('defaults to open (previous behaviour) when no flag is given', () => {
    renderForm()
    expect(screen.getByText('Başvuruda yardım ister misin?')).toBeTruthy()
  })
})
