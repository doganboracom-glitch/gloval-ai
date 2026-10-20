import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

describe('iOS input zoom guard', () => {
  const css = read('app/globals.css')

  it('forces >=16px on text fields at <=767px', () => {
    const block = css.match(/@media \(max-width: 767px\) \{\s*input:not\([^]*?\n\}/)
    expect(block).not.toBeNull()
    const rule = block![0]
    for (const sel of ['textarea', 'select', "[contenteditable='true']"]) {
      expect(rule).toContain(sel)
    }
    expect(rule).toMatch(/font-size:\s*16px/)
  })

  it('also covers every iOS device via @supports -webkit-touch-callout', () => {
    const block = css.match(/@supports \(-webkit-touch-callout: none\) \{[^]*?\n\}/)
    expect(block).not.toBeNull()
    expect(block![0]).toMatch(/textarea/)
    expect(block![0]).toMatch(/font-size:\s*16px/)
  })

  it('keeps the guard unlayered so it beats Tailwind text-* utilities', () => {
    const idx = css.indexOf('iOS input zoom guard')
    const before = css.slice(0, idx)
    const opens = (before.match(/@layer [a-z]+ \{/g) ?? []).length
    const closesApprox = before.split('\n').filter((l) => l === '}').length
    expect(closesApprox).toBeGreaterThanOrEqual(opens)
  })

  it('excludes non-text inputs from the font-size rule', () => {
    expect(css).toContain("[type='checkbox'], [type='radio']")
  })

  it('uses dynamic viewport height for full-height shells', () => {
    expect(css).toMatch(/@supports \(height: 100dvh\)[^]*?min-height:\s*100dvh/)
  })
})

describe('viewport meta', () => {
  const layout = read('app/layout.tsx')
  const viewportBlock = layout.match(/export const viewport: Viewport = \{[^]*?\n\}/)![0]

  it('allows pinch zoom', () => {
    expect(viewportBlock).not.toMatch(/maximumScale|maximum-scale|userScalable|user-scalable/)
  })

  it('declares device-width and initial-scale 1', () => {
    expect(viewportBlock).toContain("width: 'device-width'")
    expect(viewportBlock).toContain('initialScale: 1')
  })
})

describe('hero mobile layout', () => {
  const hero = read('components/hero.tsx')

  it('prompt textarea is 16px on mobile and cannot overflow', () => {
    const ta = hero.match(/<textarea[^]*?\/>/)![0]
    expect(ta).toMatch(/\btext-base\b/)
    expect(ta).toMatch(/md:text-sm/)
    expect(ta).toMatch(/\bmin-w-0\b/)
    expect(ta).toMatch(/\bw-full\b/)
  })

  it('containers shrink instead of widening the page', () => {
    expect(hero).toMatch(/id="hero-input"[^]*?min-w-0/)
  })

  it('quick-idea chips wrap inside their row', () => {
    expect(hero).toMatch(/mt-3 flex min-w-0 max-w-full flex-wrap/)
    expect(hero).toMatch(/inline-flex max-w-full/)
  })

  it('submit button label stays on one line', () => {
    const btn = hero.match(/onClick=\{\(\) => generate\(prompt\)\}[^]*?className="([^"]*)"/)![1]
    expect(btn).toContain('whitespace-nowrap')
    expect(btn).toContain('shrink-0')
  })

  it('keeps the prompt box visible when the keyboard opens', () => {
    expect(hero).toContain('onFocus={keepPromptBoxVisible}')
    expect(hero).toMatch(/scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/)
  })
})
