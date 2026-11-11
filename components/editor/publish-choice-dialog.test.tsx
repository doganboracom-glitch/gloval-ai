// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LanguageProvider } from '@/components/language-provider'
import { PublishChoiceDialog } from '@/components/editor/publish-choice-dialog'
import { LANG_COOKIE } from '@/lib/i18n'

beforeEach(() => {
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0`
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0`
})

function renderStorefrontDialog(initialLang: 'tr' | 'en') {
  return render(
    <LanguageProvider initialLang={initialLang}>
      <PublishChoiceDialog
        choice={{ mode: 'packages_only', block: 'storefront' }}
        onPublishFree={() => {}}
        onBrowsePackages={() => {}}
        onClose={() => {}}
      />
    </LanguageProvider>,
  )
}

describe('PublishChoiceDialog storefront support message', () => {
  it('shows the Turkish support route as an in-tab link', () => {
    renderStorefrontDialog('tr')

    const link = screen.getByRole('link', { name: 'Destek ekibine yazın' })
    expect(link.textContent).toBe('destek')
    expect(link.getAttribute('href')).toBe('/support/new')
    expect(link.getAttribute('target')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Bu site için E-Ticaret paketi gerekiyor' })).toBeTruthy()
    expect(
      screen.getByText(
        'E-ticaret mağazaları FREE pakette yayınlanamaz. FREE paket sadece kurumsal web sitelerini kapsar, düzenlemelerinizi paket almadan tamamlayabilirsiniz.',
      ),
    ).toBeTruthy()
    expect(link.parentElement?.textContent).toBe('Bir sorun olduğunu düşünüyorsanız destek ekibine yazın.')
    expect(screen.getByRole('button', { name: 'Paketlere göz at' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vazgeç' })).toBeTruthy()
  })

  it('shows the English support route as an in-tab link', () => {
    renderStorefrontDialog('en')

    const link = screen.getByRole('link', { name: 'Contact the support team' })
    expect(link.textContent).toBe('support')
    expect(link.getAttribute('href')).toBe('/support/new')
    expect(link.getAttribute('target')).toBeNull()
    expect(screen.getByRole('heading', { name: 'An E-commerce plan is required for this site' })).toBeTruthy()
    expect(
      screen.getByText(
        "E-commerce stores can't be published on the FREE plan. The FREE plan covers corporate websites only; you can finish your edits without buying a plan.",
      ),
    ).toBeTruthy()
    expect(link.parentElement?.textContent).toBe('If you think something is wrong, write to our support team.')
    expect(screen.getByRole('button', { name: 'Browse packages' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('does not show the storefront support message for other publishing restrictions', () => {
    render(
      <LanguageProvider initialLang="en">
        <PublishChoiceDialog
          choice={{ mode: 'packages_only', block: 'page_limit', limit: 3 }}
          onPublishFree={() => {}}
          onBrowsePackages={() => {}}
          onClose={() => {}}
        />
      </LanguageProvider>,
    )

    expect(screen.queryByRole('link')).toBeNull()
  })
})
