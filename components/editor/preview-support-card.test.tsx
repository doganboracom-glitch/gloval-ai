// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PreviewSupportCard } from '@/components/editor/preview-support-card'

const DISMISSED_KEY = 'gloval:preview-support-notice:dismissed:v1'
const SHOWN_KEY = 'gloval:preview-support-notice:shown:v1'
const REVEAL_DELAY_MS = 1_500
const AUTO_DISMISS_MS = 30_000
const TURKISH_BODY =
  'Bu web sitesi yapay zekâ tarafından oluşturulmuştur. İstediğiniz ek özellik veya modül (canlı yayın oynatıcı, özel liste, entegrasyon vb.) etkin değilse Teknik Ekibimize talep iletebilirsiniz; özel geliştirme ihtiyaca göre ücretli veya ücretsiz yapılabilir.'

function scopedKey(key: string, projectId = 'project-1') {
  return `${key}:${encodeURIComponent(projectId)}`
}

function renderCard(projectId = 'project-1', isEditorPreview = true) {
  return render(
    <LanguageProvider initialLang="tr">
      <PreviewSupportCard projectId={projectId} isEditorPreview={isEditorPreview} />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PreviewSupportCard', () => {
  it('reveals a Turkish status notice after 1.5 seconds with an inline prefilled support link', () => {
    vi.useFakeTimers()
    renderCard()

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS - 1))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()

    act(() => vi.advanceTimersByTime(1))

    const notice = screen.getByRole('status')
    expect(notice.getAttribute('aria-live')).toBe('polite')
    expect(notice.textContent).toContain(TURKISH_BODY)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Destek' }).getAttribute('href')).toBe(
      '/support/new?department=technical&service=website&project=project-1',
    )
    expect(window.sessionStorage.getItem(scopedKey(SHOWN_KEY))).toBe('true')
  })

  it('persists manual dismissal and does not show again for that project', () => {
    vi.useFakeTimers()
    const firstRender = renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))

    fireEvent.click(screen.getByRole('button', { name: 'Bilgilendirmeyi kapat' }))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.localStorage.getItem(scopedKey(DISMISSED_KEY))).toBe('true')

    firstRender.unmount()
    renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('automatically dismisses after 30 seconds and persists the one-time state', () => {
    vi.useFakeTimers()
    const firstRender = renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS - 1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.localStorage.getItem(scopedKey(DISMISSED_KEY))).toBe('true')

    firstRender.unmount()
    renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('pauses the auto-dismiss timer while hovered', () => {
    vi.useFakeTimers()
    renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    const notice = screen.getByTestId('preview-support-notice')

    fireEvent.mouseEnter(notice)
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    fireEvent.mouseLeave(notice)
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS - 1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('pauses the auto-dismiss timer while keyboard focus is inside the notice', () => {
    vi.useFakeTimers()
    renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    const link = screen.getByRole('link', { name: 'Destek' })

    fireEvent.focusIn(link)
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    fireEvent.focusOut(link, { relatedTarget: document.body })
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS - 1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('does not show again in the same session for the same project', () => {
    window.sessionStorage.setItem(scopedKey(SHOWN_KEY), 'true')

    renderCard()

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('scopes the one-time display to each project', () => {
    vi.useFakeTimers()
    const firstRender = renderCard()
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    firstRender.unmount()
    renderCard('project-2')
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
  })

  it('stays hidden outside the editor preview', () => {
    vi.useFakeTimers()
    renderCard('project-1', false)
    act(() => vi.advanceTimersByTime(REVEAL_DELAY_MS + AUTO_DISMISS_MS))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.sessionStorage.getItem(scopedKey(SHOWN_KEY))).toBeNull()
  })
})
