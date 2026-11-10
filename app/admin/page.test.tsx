import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  summary: null as null | Record<string, unknown>,
}))

vi.mock('@/lib/admin/queries', () => ({ getOverview: vi.fn(async () => ({ overview: true })) }))
vi.mock('@/lib/admin/heard-from-summary', () => ({ getHeardFromSummary: vi.fn(async () => state.summary) }))
vi.mock('@/components/admin/dashboard-view', () => ({ DashboardView: () => null }))
vi.mock('@/components/admin/heard-from-summary-card', () => ({ HeardFromSummaryCard: () => null }))

import AdminDashboardPage from './page'
import { HeardFromSummaryCard } from '@/components/admin/heard-from-summary-card'

type Node = { type?: unknown; props?: { children?: Node | Node[]; summary?: unknown } } | null | false
function findCards(node: Node | Node[]): Array<NonNullable<Exclude<Node, false>>> {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(findCards)
  const own = node.type === HeardFromSummaryCard ? [node] : []
  return [...own, ...findCards(node.props?.children as Node | Node[])]
}

beforeEach(() => {
  state.summary = null
})

describe('/admin overview page', () => {
  it('renders no heard-from card (and passes no data) when the summary is null', async () => {
    const tree = (await AdminDashboardPage()) as unknown as Node
    expect(findCards(tree)).toHaveLength(0)
  })

  it('renders the card with the aggregate summary for admins', async () => {
    state.summary = { totalSignups: 4 }
    const tree = (await AdminDashboardPage()) as unknown as Node
    const cards = findCards(tree)
    expect(cards).toHaveLength(1)
    expect(cards[0]?.props?.summary).toEqual({ totalSignups: 4 })
  })
})
