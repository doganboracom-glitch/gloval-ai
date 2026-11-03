// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { PreviewSupportCard } from '@/components/editor/preview-support-card'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildSampleSite } from '@/lib/__fixtures__/sample-site'

const DISMISSED_KEY = 'gloval:preview-support-notice:dismissed:v1'
const SHOWN_KEY = 'gloval:preview-support-notice:shown:v1'
const SESSION_SCOPE_KEY = 'gloval:preview-support-notice:session-scope:v1'
const PAGE_OPEN_DELAY_MS = 7_000
const AUTO_DISMISS_MS = 20_000
const TURKISH_BODY =
  'Bu web sitesi yapay zekâ tarafından oluşturulmuştur. İstediğiniz ek özellik veya modül (canlı yayın oynatıcı, özel liste, entegrasyon vb.) etkin değilse Teknik Ekibimize talep iletebilirsiniz; özel geliştirme ihtiyaca göre ücretli veya ücretsiz yapılabilir.'

function scopedKey(key: string, scope = 'project-1') {
  return `${key}:${encodeURIComponent(scope)}`
}

function cardElement(
  projectId: string | null = 'project-1',
  isPreview = true,
  previewId: string | null = null,
  hasScrolledDown = false,
) {
  return (
    <LanguageProvider initialLang="tr">
      <PreviewSupportCard
        projectId={projectId}
        previewId={previewId}
        isPreview={isPreview}
        hasScrolledDown={hasScrolledDown}
      />
    </LanguageProvider>
  )
}

function renderCard(
  projectId: string | null = 'project-1',
  isPreview = true,
  previewId: string | null = null,
  hasScrolledDown = false,
) {
  return render(cardElement(projectId, isPreview, previewId, hasScrolledDown))
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
  it('requires a downward scroll and at least seven seconds after opening', () => {
    vi.useFakeTimers()
    const view = renderCard()

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()

    view.rerender(cardElement('project-1', true, null, true))

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

  it('waits until seven seconds have passed when the user scrolls earlier', () => {
    vi.useFakeTimers()
    const view = renderCard()
    view.rerender(cardElement('project-1', true, null, true))

    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS - 1))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
  })

  it('reveals the same notice for a guest preview and preserves the support prefill without a project', () => {
    vi.useFakeTimers()
    renderCard(null, true, 'draft-1', true)

    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))

    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Destek' }).getAttribute('href')).toBe(
      '/support/new?department=technical&service=website',
    )
    expect(window.sessionStorage.getItem(scopedKey(SHOWN_KEY, 'draft-1'))).toBe('true')
  })

  it('persists manual dismissal and does not show again for that project', () => {
    vi.useFakeTimers()
    const firstRender = renderCard('project-1', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))

    fireEvent.click(screen.getByRole('button', { name: 'Bilgilendirmeyi kapat' }))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.localStorage.getItem(scopedKey(DISMISSED_KEY))).toBe('true')

    firstRender.unmount()
    renderCard('project-1', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('automatically dismisses a guest notice after 20 seconds and persists the one-time state', () => {
    vi.useFakeTimers()
    const firstRender = renderCard(null, true, 'draft-1', true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS - 1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.localStorage.getItem(scopedKey(DISMISSED_KEY, 'draft-1'))).toBe('true')

    firstRender.unmount()
    renderCard(null, true, 'draft-1', true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('does not extend the auto-dismiss timer while hovered', () => {
    vi.useFakeTimers()
    renderCard('project-1', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    const notice = screen.getByTestId('preview-support-notice')

    fireEvent.mouseEnter(notice)
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS - 1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('pauses the auto-dismiss timer only while keyboard focus is inside the notice', () => {
    vi.useFakeTimers()
    renderCard('project-1', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    const link = screen.getByRole('link', { name: 'Destek' })

    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS / 2))
    fireEvent.focusIn(link)
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    fireEvent.focusOut(link, { relatedTarget: document.body })
    act(() => vi.advanceTimersByTime(AUTO_DISMISS_MS / 2 - 1))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('does not show again in the same session for the same project', () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem(scopedKey(SHOWN_KEY), 'true')

    renderCard('project-1', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
  })

  it('shows only once for the same guest draft and once again for a newly generated preview', () => {
    vi.useFakeTimers()
    const firstRender = renderCard(null, true, 'draft-1', true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    firstRender.unmount()
    const samePreview = renderCard(null, true, 'draft-1', true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.queryByTestId('preview-support-notice')).toBeNull()

    samePreview.unmount()
    renderCard(null, true, 'draft-2', true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
  })

  it('uses a session-scoped identity if a guest preview has no draft id', () => {
    vi.useFakeTimers()
    renderCard(null, true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))

    const sessionScope = window.sessionStorage.getItem(SESSION_SCOPE_KEY)
    expect(sessionScope).toBeTruthy()
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
    expect(window.sessionStorage.getItem(scopedKey(SHOWN_KEY, sessionScope ?? ''))).toBe('true')
  })

  it('scopes the one-time display to each project', () => {
    vi.useFakeTimers()
    const firstRender = renderCard('project-1', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()

    firstRender.unmount()
    renderCard('project-2', true, null, true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS))
    expect(screen.getByTestId('preview-support-notice')).toBeTruthy()
  })

  it('stays hidden when outside a preview, including for published WebsiteRenderer pages', () => {
    vi.useFakeTimers()
    renderCard(null, false, 'draft-1', true)
    act(() => vi.advanceTimersByTime(PAGE_OPEN_DELAY_MS + AUTO_DISMISS_MS))

    expect(screen.queryByTestId('preview-support-notice')).toBeNull()
    expect(window.sessionStorage.getItem(scopedKey(SHOWN_KEY, 'draft-1'))).toBeNull()

    const publishedHtml = renderToStaticMarkup(<WebsiteRenderer site={buildSampleSite()} />)
    expect(publishedHtml).not.toContain('data-testid="preview-support-notice"')
  })
})
