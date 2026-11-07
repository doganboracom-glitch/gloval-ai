import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { metaPlanBadge } from '@/lib/ads/meta-manage-ux'
import { META_PLAN_STATUS_LABELS } from '@/lib/ads/meta-publish-ux'
import {
  metaPlanPickerAriaLabel,
  metaPlanStatusAriaText,
  metaPlanStatusView,
  type MetaPlanColorKey,
} from '@/lib/ads/meta-plan-status'

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

type Case = { name: string; plan: { status: string; effectiveStatus?: string | null }; colorKey: MetaPlanColorKey; trLabel: string; enLabel: string }

const CASES: Case[] = [
  { name: 'draft', plan: { status: 'draft' }, colorKey: 'draft', trLabel: 'Taslak', enLabel: 'Draft' },
  { name: 'paused (published)', plan: { status: 'published' }, colorKey: 'paused', trLabel: 'Duraklatıldı', enLabel: 'Paused' },
  { name: 'paused (user)', plan: { status: 'user_paused' }, colorKey: 'paused', trLabel: 'Duraklatıldı', enLabel: 'Paused' },
  { name: 'partial', plan: { status: 'partial' }, colorKey: 'partial', trLabel: 'Kısmen oluştu', enLabel: 'Partially created' },
  { name: 'active', plan: { status: 'active', effectiveStatus: 'ACTIVE' }, colorKey: 'active', trLabel: 'Etkin', enLabel: 'Active' },
  { name: 'active, no effective status', plan: { status: 'active' }, colorKey: 'active', trLabel: 'Etkin', enLabel: 'Active' },
  { name: 'in review', plan: { status: 'active', effectiveStatus: 'PENDING_REVIEW' }, colorKey: 'review', trLabel: 'Meta incelemesinde', enLabel: 'In Meta review' },
  { name: 'in review (in process)', plan: { status: 'active', effectiveStatus: 'IN_PROCESS' }, colorKey: 'review', trLabel: 'Meta incelemesinde', enLabel: 'In Meta review' },
  { name: 'disapproved', plan: { status: 'active', effectiveStatus: 'DISAPPROVED' }, colorKey: 'error', trLabel: 'Reddedildi', enLabel: 'Rejected' },
  { name: 'failed', plan: { status: 'failed' }, colorKey: 'error', trLabel: 'Başarısız', enLabel: 'Failed' },
  { name: 'publishing', plan: { status: 'publishing' }, colorKey: 'review', trLabel: 'Oluşturuluyor', enLabel: 'Creating' },
  { name: 'archived', plan: { status: 'archived' }, colorKey: 'archived', trLabel: 'Arşivlendi', enLabel: 'Archived' },
]

describe('metaPlanStatusView', () => {
  for (const c of CASES) {
    it(`maps ${c.name}`, () => {
      const tr = metaPlanStatusView(c.plan, 'tr')
      const en = metaPlanStatusView(c.plan, 'en')
      expect(tr.colorKey).toBe(c.colorKey)
      expect(tr.label).toBe(c.trLabel)
      expect(en.label).toBe(c.enLabel)
      expect(tr.ariaLabel).toBe(`Plan durumu: ${c.trLabel}`)
      expect(en.ariaLabel).toBe(`Plan status: ${c.enLabel}`)
    })
  }

  it('defaults unknown statuses to draft', () => {
    expect(metaPlanStatusView({ status: 'something_new' }).colorKey).toBe('draft')
  })

  it('maps validated and approved to the draft colour while keeping their own label', () => {
    expect(metaPlanStatusView({ status: 'validated' }).colorKey).toBe('draft')
    expect(metaPlanStatusView({ status: 'validated' }).label).toBe('Doğrulandı')
    expect(metaPlanStatusView({ status: 'approved' }).label).toBe('Onaylandı')
  })

  it('only a live active campaign pulses, and only the archived look has no glow', () => {
    for (const c of CASES) {
      const view = metaPlanStatusView(c.plan, 'tr')
      expect(view.pulse).toBe(c.colorKey === 'active')
      expect(view.glow).toBe(c.colorKey !== 'archived')
    }
  })

  it('always pairs colour with an icon and a text label', () => {
    for (const c of CASES) {
      const view = metaPlanStatusView(c.plan, 'tr')
      expect(view.icon).toBeTruthy()
      expect(view.label.length).toBeGreaterThan(0)
    }
  })

  it('exposes the same status text in the aria message', () => {
    expect(metaPlanStatusAriaText('Etkin', 'tr')).toBe('Plan durumu: Etkin')
    expect(metaPlanStatusAriaText('Active', 'en')).toBe('Plan status: Active')
  })
})

describe('metaPlanPickerAriaLabel', () => {
  const view = metaPlanStatusView({ status: 'partial' }, 'tr')
  it('includes name and status, and marks the open plan as selected', () => {
    expect(metaPlanPickerAriaLabel('GLOVALadsv1', view, false, 'tr')).toBe('GLOVALadsv1, Plan durumu: Kısmen oluştu')
    expect(metaPlanPickerAriaLabel('GLOVALadsv1', view, true, 'tr')).toBe('GLOVALadsv1, Plan durumu: Kısmen oluştu, seçili')
    expect(metaPlanPickerAriaLabel('Plan', metaPlanStatusView({ status: 'draft' }, 'en'), true, 'en')).toBe('Plan, Plan status: Draft, selected')
  })
})

describe('shared consumers use the same mapping', () => {
  it('the card badge agrees with the status view for every case', () => {
    for (const c of CASES) {
      const badge = metaPlanBadge(c.plan)
      const view = metaPlanStatusView(c.plan, 'tr')
      expect(badge.key).toBe(view.key)
      expect(badge.label).toBe(view.label)
      expect(badge.tone).toBe(view.tone)
    }
  })

  it('the picker label table is derived from the mapping', () => {
    expect(META_PLAN_STATUS_LABELS.published).toBe('Duraklatıldı')
    expect(META_PLAN_STATUS_LABELS.partial).toBe('Kısmen oluştu')
    expect(META_PLAN_STATUS_LABELS.active).toBe('Etkin')
  })
})

describe('status colour tokens', () => {
  const colorKeys = new Set(CASES.map((c) => c.colorKey))

  it('defines a CSS variable and a class for every colour key', () => {
    for (const key of colorKeys) {
      expect(css).toContain(`--plan-${key}:`)
      expect(css).toContain(`.plan-status--${key}`)
    }
    expect(css).toContain('--plan-selected:')
  })

  it('disables the pulse under prefers-reduced-motion', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('plan-status-pulse')))
    expect(block).toContain('.plan-status[data-pulse="true"]')
    expect(block).toMatch(/animation:\s*none/)
  })

  it('keeps every token light enough for AA contrast on the dark card (oklch L >= 0.7)', () => {
    for (const key of [...colorKeys, 'selected']) {
      const match = css.match(new RegExp(`--plan-${key}:\\s*oklch\\(([\\d.]+)`))
      expect(match, `--plan-${key}`).not.toBeNull()
      expect(Number(match![1])).toBeGreaterThanOrEqual(0.7)
    }
  })
})
