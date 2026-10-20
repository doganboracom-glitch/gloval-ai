// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ComparisonPlanPicker } from '@/components/pricing/comparison-plan-picker'
import { buildComparison, getComparisonCopy } from '@/lib/plan-copy'

afterEach(cleanup)

function setup(currentPlanCode?: 'free' | 'starter' | 'pro' | 'ecommerce') {
  return render(
    <ComparisonPlanPicker
      comparison={buildComparison('tr')}
      copy={getComparisonCopy('tr')}
      currentPlanCode={currentPlanCode}
    />,
  )
}

describe('ComparisonPlanPicker', () => {
  it('opens on PRO by default and lists one value column', () => {
    setup()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)
    expect(screen.getByRole('tab', { name: /PRO/ }).getAttribute('aria-selected')).toBe('true')
    const panel = screen.getByRole('tabpanel')
    expect(panel.querySelectorAll('thead th')).toHaveLength(2)
    expect(within(panel).getByText('En çok tercih edilen')).toBeTruthy()
  })

  it('opens on the current plan when one is given', () => {
    setup('starter')
    expect(screen.getByRole('tab', { name: 'STARTER' }).getAttribute('aria-selected')).toBe('true')
  })

  it('switches plan on click and keeps only the active tab tabbable', () => {
    setup()
    fireEvent.click(screen.getByRole('tab', { name: 'FREE' }))
    expect(screen.getByRole('tab', { name: 'FREE' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'FREE' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('tab', { name: /PRO/ }).getAttribute('tabindex')).toBe('-1')
    expect(within(screen.getByRole('tabpanel')).queryByText('En çok tercih edilen')).toBeNull()
  })

  it('supports arrow, Home and End keys', () => {
    setup('free')
    const free = screen.getByRole('tab', { name: 'FREE' })
    fireEvent.keyDown(free, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'STARTER' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'STARTER' }), { key: 'End' })
    expect(screen.getByRole('tab', { name: 'E-TİCARET' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'E-TİCARET' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'FREE' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('ComparisonPlanPicker blog rows', () => {
  it('shows the content group with the blog rows for the active plan', () => {
    setup()
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('İçerik ve blog')).toBeTruthy()
    expect(within(panel).getByText('Site blogu (ayrı blog sayfaları + AI yazı üretimi)')).toBeTruthy()
    expect(within(panel).getByText('AI yazı üretimi (kredi ile)')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'FREE' }))
    const free = screen.getByRole('tabpanel')
    expect(within(free).getByText('AI yazı üretimi (kredi ile)')).toBeTruthy()
  })
})
