// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { ReferencesSection } from '@/components/website-renderer/sections/references-section'
import { REFERENCES_CAROUSEL_INTERVAL_MS } from '@/lib/references'
import type { Section } from '@/lib/website-schema'

type RefSection = Extract<Section, { type: 'references' }>

const data = {
  type: 'references',
  title: 'Referanslar',
  items: Array.from({ length: 8 }, (_, i) => ({
    name: `Firma ${i + 1}`,
    logo: { src: 'data:image/png;base64,iVBORw0KGgo=' },
    ...(i === 0 ? { url: 'https://firma1.com' } : {}),
  })),
} as unknown as RefSection

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const track = (root: HTMLElement) => root.querySelector<HTMLElement>('.gv-ref-track')!
const tick = () => act(() => void vi.advanceTimersByTime(REFERENCES_CAROUSEL_INTERVAL_MS))

describe('carousel pauses while a logo is hovered or focused', () => {
  it('advances on its own when idle', () => {
    const { container } = render(<ReferencesSection data={data} />)
    const before = track(container).style.transform
    tick()
    expect(track(container).style.transform).not.toBe(before)
  })

  it('stops on mouse hover and resumes on mouse leave', () => {
    const { container } = render(<ReferencesSection data={data} />)
    const group = container.querySelector('[role="group"]')!
    fireEvent.mouseEnter(group)
    const held = track(container).style.transform
    tick()
    tick()
    expect(track(container).style.transform).toBe(held)
    fireEvent.mouseLeave(group)
    tick()
    expect(track(container).style.transform).not.toBe(held)
  })

  it('stops while the link has keyboard focus and resumes on blur', () => {
    const { container } = render(<ReferencesSection data={data} />)
    const link = container.querySelector<HTMLAnchorElement>('a[data-reference-link]')!
    act(() => link.focus())
    const held = track(container).style.transform
    tick()
    expect(track(container).style.transform).toBe(held)
    act(() => link.blur())
    tick()
    expect(track(container).style.transform).not.toBe(held)
  })
})
