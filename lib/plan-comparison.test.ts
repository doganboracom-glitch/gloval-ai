import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildComparison, getComparisonCopy } from '@/lib/plan-copy'
import {
  COMPARISON_PLANS,
  defaultComparisonPlan,
  nextTabIndex,
  selectPlanColumn,
} from '@/lib/plan-comparison'

describe('selectPlanColumn', () => {
  it('projects every group down to the selected plan column', () => {
    const comparison = buildComparison('tr')
    for (const { code } of COMPARISON_PLANS) {
      const columns = selectPlanColumn(comparison, code)
      expect(columns).toHaveLength(comparison.length)
      columns.forEach((group, g) => {
        expect(group.category).toBe(comparison[g].category)
        group.rows.forEach((row, r) => {
          expect(row.label).toBe(comparison[g].rows[r].label)
          expect(row.value).toBe(comparison[g].rows[r][code])
        })
      })
    }
  })
})

describe('defaultComparisonPlan', () => {
  it('opens on the current plan, falling back to the popular one', () => {
    expect(defaultComparisonPlan('starter')).toBe('starter')
    expect(defaultComparisonPlan('free')).toBe('free')
    expect(defaultComparisonPlan(undefined)).toBe('pro')
    expect(defaultComparisonPlan(null)).toBe('pro')
  })
})

describe('nextTabIndex', () => {
  it('moves with arrows, wraps around and jumps with Home/End', () => {
    expect(nextTabIndex('ArrowRight', 0, 4)).toBe(1)
    expect(nextTabIndex('ArrowRight', 3, 4)).toBe(0)
    expect(nextTabIndex('ArrowLeft', 0, 4)).toBe(3)
    expect(nextTabIndex('Home', 2, 4)).toBe(0)
    expect(nextTabIndex('End', 1, 4)).toBe(3)
    expect(nextTabIndex('Enter', 1, 4)).toBeNull()
  })

  it('mirrors the arrows for right-to-left languages', () => {
    expect(nextTabIndex('ArrowLeft', 0, 4, true)).toBe(1)
    expect(nextTabIndex('ArrowRight', 0, 4, true)).toBe(3)
  })
})

describe('comparison copy', () => {
  it('has the mobile picker strings in both languages', () => {
    for (const lang of ['tr', 'en']) {
      const copy = getComparisonCopy(lang)
      expect(copy.planPicker.length).toBeGreaterThan(0)
      expect(copy.popular.length).toBeGreaterThan(0)
    }
  })
})

describe('horizontal overflow guards', () => {
  const root = join(__dirname, '..')

  it('clips horizontal overflow on the body', () => {
    const css = readFileSync(join(root, 'app/globals.css'), 'utf8')
    expect(css).toMatch(/body\s*{[^}]*overflow-x:\s*clip/)
  })

  it('swaps the wide table for the plan picker below md', () => {
    const source = readFileSync(
      join(root, 'components/pricing/comparison-accordion.tsx'),
      'utf8',
    )
    expect(source).toContain('className="md:hidden"')
    expect(source).toContain('hidden overflow-x-auto md:block')
  })
})
