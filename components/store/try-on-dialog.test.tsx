// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TryOnButton } from './try-on-button'

function renderButton() {
  return render(
    <main id="page">
      <button type="button" id="cart" style={{ position: 'fixed', zIndex: 9997 }}>
        Sepetim
      </button>
      <TryOnButton
        productImage="https://cdn.example.test/p.webp"
        productName="Yüzük"
        target={{ mode: 'demo', demoSlug: 'eticaret' }}
        trigger={({ onClick }) => (
          <button type="button" onClick={onClick}>
            Sanal dene
          </button>
        )}
      />
    </main>,
  )
}

afterEach(() => {
  cleanup()
  document.body.removeAttribute('style')
})

describe('TryOnDialog', () => {
  it('renders nothing into the page until opened', () => {
    renderButton()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('portals to <body> in an isolated stacking context above fixed page elements', () => {
    const { container } = renderButton()
    fireEvent.click(screen.getByText('Sanal dene'))

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(container.contains(dialog)).toBe(false)

    const layer = dialog.parentElement as HTMLElement
    expect(layer.parentElement).toBe(document.body)
    expect(layer.classList.contains('isolate')).toBe(true)
    expect(Number(layer.style.zIndex)).toBeGreaterThan(9999)
  })

  it('locks page scroll while open and restores it on close', () => {
    document.body.style.overflow = 'auto'
    renderButton()
    fireEvent.click(screen.getByText('Sanal dene'))
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByLabelText('Kapat'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('closes on Escape and returns focus to the trigger', () => {
    renderButton()
    const trigger = screen.getByText('Sanal dene')
    trigger.focus()
    fireEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByLabelText('Kapat'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when the backdrop is clicked but not when the dialog body is', () => {
    renderButton()
    fireEvent.click(screen.getByText('Sanal dene'))
    const dialog = screen.getByRole('dialog')

    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).not.toBeNull()

    const backdrop = dialog.parentElement?.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps Tab focus inside the dialog', () => {
    renderButton()
    fireEvent.click(screen.getByText('Sanal dene'))
    const dialog = screen.getByRole('dialog')
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'))
    const last = buttons[buttons.length - 1]

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('keeps a fixed-ratio media stage and a scrollable body so content never jumps or clips', () => {
    renderButton()
    fireEvent.click(screen.getByText('Sanal dene'))
    const dialog = screen.getByRole('dialog')

    expect(dialog.querySelector('.aspect-square')).not.toBeNull()
    expect(dialog.querySelector('.overflow-y-auto')).not.toBeNull()
    expect(dialog.className).toContain('max-h-[calc(100dvh-2rem)]')
    // The primary action lives in a footer outside the scroll area.
    const generate = screen.getByText('Oluştur').closest('button') as HTMLElement
    expect(dialog.querySelector('.overflow-y-auto')?.contains(generate)).toBe(false)
  })
})
