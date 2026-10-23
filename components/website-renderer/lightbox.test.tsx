// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Lightbox } from '@/components/website-renderer/lightbox'
import type { LightboxItem } from '@/lib/lightbox-nav'

const ITEMS: LightboxItem[] = [
  { kind: 'image', src: '/a.jpg', alt: 'A', caption: 'First' },
  { kind: 'image', src: '/b.jpg', alt: 'B' },
  { kind: 'video', embedUrl: 'https://www.youtube-nocookie.com/embed/abc', title: 'Clip' },
]

function Harness({ start = 0 }: { start?: number }) {
  const [open, setOpen] = useState<number | null>(null)
  const [initial] = useState(start)
  return (
    <>
      <button onClick={() => setOpen(initial)}>opener</button>
      {open !== null ? (
        <Lightbox items={ITEMS} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} />
      ) : null}
    </>
  )
}

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('Lightbox', () => {
  it('is a modal dialog and shows the counter and caption', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('1/3')).toBeTruthy()
    expect(screen.getByText('First')).toBeTruthy()
  })

  it('moves with arrows (wrapping) and the nav buttons', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(screen.getByText('2/3')).toBeTruthy()
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(screen.getByText('3/3')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Sonraki'))
    expect(screen.getByText('1/3')).toBeTruthy()
  })

  it('closes on Esc and returns focus to the opener', () => {
    render(<Harness />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByLabelText('Kapat'))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on backdrop click but not on content click', () => {
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.click(screen.getByAltText('A'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(container.ownerDocument.querySelector('[data-gv-lightbox-stage]') as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps Tab focus inside the dialog', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    const dialog = screen.getByRole('dialog')
    const close = screen.getByLabelText('Kapat')
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button'))
    const last = buttons[buttons.length - 1]
    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(buttons[0])
    close.focus()
    buttons[0].focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('swipes between items', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    const stage = document.querySelector('[data-gv-lightbox-stage]') as HTMLElement
    fireEvent.touchStart(stage, { touches: [{ clientX: 200, clientY: 100 }] })
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 100, clientY: 105 }] })
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('mounts the video iframe only while the video item is shown', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('opener'))
    expect(document.querySelector('iframe')).toBeNull()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    const frame = document.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/abc?autoplay=1')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(document.querySelector('iframe')).toBeNull()
  })
})
