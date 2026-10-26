// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  ADD_ONS_ANCHOR,
  CollapsibleAddOnsSection,
  CollapsibleSection,
  HISTORY_ANCHOR,
  PLANS_ANCHOR,
  wantsAddOnsOpen,
  wantsHistoryOpen,
  wantsPlansOpen,
  wantsPlansScroll,
} from '@/components/billing/collapsible-add-ons-section'

const scrollIntoView = vi.fn()

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0)
    return 0
  }) as typeof window.requestAnimationFrame
  window.history.replaceState(null, '', '/billing')
})

afterEach(() => {
  cleanup()
  scrollIntoView.mockClear()
})

function renderSection(forceOpen = false) {
  return render(
    <CollapsibleAddOnsSection title="Diğer Ek Paketler" summary="2 paket" forceOpen={forceOpen}>
      <button type="button">Satın al</button>
      <button type="button">Satın al 2</button>
    </CollapsibleAddOnsSection>,
  )
}

describe('wantsAddOnsOpen', () => {
  it('opens for the anchor and add-on intent params only', () => {
    expect(wantsAddOnsOpen(`#${ADD_ONS_ANCHOR}`, '')).toBe(true)
    expect(wantsAddOnsOpen('', '?addon=branding_removal')).toBe(true)
    expect(wantsAddOnsOpen('', '?publish=abc')).toBe(true)
    expect(wantsAddOnsOpen('', '')).toBe(false)
    expect(wantsAddOnsOpen('#plan-pro', '?plan=pro')).toBe(false)
    expect(wantsAddOnsOpen('#fatura-bilgileri', '?fatura=1')).toBe(false)
  })
})

describe('Ek Paketler açılır bölümü', () => {
  it('varsayılan kapalı: başlık ve adet görünür, kartlar klavye/ekran okuyucudan çıkarılmış', () => {
    renderSection()
    const toggle = screen.getByRole('button', { name: /Diğer Ek Paketler/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('2 paket')).toBeTruthy()
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(panel.hasAttribute('inert')).toBe(true)
    expect(panel.contains(screen.getByText('Satın al'))).toBe(true)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('tıklayınca açılır, tekrar tıklayınca kapanır', () => {
    renderSection()
    const toggle = screen.getByRole('button', { name: /Diğer Ek Paketler/ })
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hasAttribute('inert')).toBe(false)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hasAttribute('inert')).toBe(true)
  })

  it('#ek-paketler çapasıyla gelince açılır ve bölüme kayar', () => {
    window.history.replaceState(null, '', `/billing#${ADD_ONS_ANCHOR}`)
    renderSection()
    expect(
      screen.getByRole('button', { name: /Diğer Ek Paketler/ }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(scrollIntoView).toHaveBeenCalled()
    expect(document.getElementById(ADD_ONS_ANCHOR)).toBeTruthy()
  })

  it('?addon= ile gelince açılır', () => {
    window.history.replaceState(null, '', '/billing?addon=multilang')
    renderSection()
    expect(
      screen.getByRole('button', { name: /Diğer Ek Paketler/ }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('forceOpen (yayın akışı) ile baştan açık gelir', () => {
    renderSection(true)
    expect(
      screen.getByRole('button', { name: /Diğer Ek Paketler/ }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Satın al' })).toBeTruthy()
  })

  it('ilgisiz çapa/parametrelerde kapalı kalır', () => {
    window.history.replaceState(null, '', '/billing?fatura=1#fatura-bilgileri')
    renderSection()
    expect(
      screen.getByRole('button', { name: /Diğer Ek Paketler/ }).getAttribute('aria-expanded'),
    ).toBe('false')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('wantsPlansOpen / wantsHistoryOpen', () => {
  it('plans open for anchors and plan flows, not for add-on or history links', () => {
    expect(wantsPlansOpen(`#${PLANS_ANCHOR}`, '')).toBe(true)
    expect(wantsPlansOpen('#plan-pro', '')).toBe(true)
    expect(wantsPlansOpen('', '?plan=pro')).toBe(true)
    expect(wantsPlansOpen('', '?upgrade=1')).toBe(true)
    expect(wantsPlansOpen('', '?publish=abc')).toBe(true)
    expect(wantsPlansOpen('', '')).toBe(false)
    expect(wantsPlansOpen(`#${ADD_ONS_ANCHOR}`, '')).toBe(false)
    expect(wantsPlansOpen(`#${HISTORY_ANCHOR}`, '')).toBe(false)
  })

  it('plans scroll only for anchors, never for flow params', () => {
    expect(wantsPlansScroll('#paketler')).toBe(true)
    expect(wantsPlansScroll('#plan-starter')).toBe(true)
    expect(wantsPlansScroll('')).toBe(false)
  })

  it('history opens only for its own anchor', () => {
    expect(wantsHistoryOpen(`#${HISTORY_ANCHOR}`, '')).toBe(true)
    expect(wantsHistoryOpen('', '?plan=pro')).toBe(false)
    expect(wantsHistoryOpen(`#${PLANS_ANCHOR}`, '')).toBe(false)
  })
})

function renderHistory() {
  return render(
    <CollapsibleSection
      id={HISTORY_ANCHOR}
      title="İşlem geçmişi"
      summary="3 işlem"
      opensOn={wantsHistoryOpen}
    >
      <p>Kayıt</p>
    </CollapsibleSection>,
  )
}

describe('Ödeme geçmişi açılır bölümü', () => {
  it('varsayılan kapalı; başlıkta gerçek kayıt sayısı görünür', () => {
    renderHistory()
    const toggle = screen.getByRole('button', { name: /İşlem geçmişi/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('3 işlem')).toBeTruthy()
  })

  it('#odeme-gecmisi ile açılır ve kayar', () => {
    window.history.replaceState(null, '', `/billing#${HISTORY_ANCHOR}`)
    renderHistory()
    expect(
      screen.getByRole('button', { name: /İşlem geçmişi/ }).getAttribute('aria-expanded'),
    ).toBe('true')
    expect(scrollIntoView).toHaveBeenCalled()
  })
})

describe('Paketler açılır bölümü', () => {
  function renderPlans(forceOpen: boolean) {
    return render(
      <CollapsibleSection
        id={PLANS_ANCHOR}
        title="Paketler"
        forceOpen={forceOpen}
        opensOn={wantsPlansOpen}
        scrollsOn={wantsPlansScroll}
      >
        <p>Plan kartları</p>
      </CollapsibleSection>,
    )
  }

  it('ücretli planı olmayanda (forceOpen) açık gelir', () => {
    renderPlans(true)
    expect(screen.getByRole('button', { name: 'Paketler' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
  })

  it('ücretli planlıda kapalı gelir', () => {
    renderPlans(false)
    expect(screen.getByRole('button', { name: 'Paketler' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
  })

  it('?plan= açar ama kaydırmaz; #plan-pro hem açar hem kaydırır', () => {
    window.history.replaceState(null, '', '/billing?plan=pro')
    renderPlans(false)
    expect(screen.getByRole('button', { name: 'Paketler' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(scrollIntoView).not.toHaveBeenCalled()
    cleanup()
    window.history.replaceState(null, '', '/billing#plan-pro')
    renderPlans(false)
    expect(screen.getByRole('button', { name: 'Paketler' }).getAttribute('aria-expanded')).toBe(
      'true',
    )
    expect(scrollIntoView).toHaveBeenCalled()
  })
})
