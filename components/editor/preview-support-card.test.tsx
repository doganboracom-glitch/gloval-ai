// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PreviewSupportCard } from '@/components/editor/preview-support-card'

const DISMISSED_KEY = 'gloval:preview-support-notice:dismissed:v1'
const SHOWN_KEY = 'gloval:preview-support-notice:shown:v1'
const TURKISH_BODY =
  'Bu web sitesi yapay zekâ tarafından oluşturulmuştur. İstediğiniz ek özellik veya modül (canlı yayın oynatıcı, özel listeler, entegrasyonlar vb.) sitenizde etkin değilse, Teknik Ekibimize destek talebi oluşturabilirsiniz. İhtiyacınıza göre özel geliştirme ek ücret karşılığında yapılabilir.'

function renderCard(projectId = 'project-1') {
  return render(
    <LanguageProvider initialLang="tr">
      <PreviewSupportCard projectId={projectId} />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(cleanup)

describe('PreviewSupportCard', () => {
  it('shows the Turkish notice and prefills the technical site-development ticket', async () => {
    renderCard()

    expect(await screen.findByText(TURKISH_BODY)).toBeTruthy()
    expect(screen.getByRole('note')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Destek talebi oluştur' }).getAttribute('href')).toBe(
      '/support/new?department=technical&service=website&project=project-1',
    )
    expect(window.sessionStorage.getItem(SHOWN_KEY)).toBe('true')
  })

  it('persists dismissal in localStorage', async () => {
    renderCard()
    await screen.findByTestId('preview-support-notice')

    fireEvent.click(screen.getByRole('button', { name: 'Bilgilendirmeyi kapat' }))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe('true')
  })

  it('does not show a second time in the same session', () => {
    window.sessionStorage.setItem(SHOWN_KEY, 'true')

    renderCard()

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })
})
