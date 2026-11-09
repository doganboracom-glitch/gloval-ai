// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { MetaConnectionView } from '@/lib/ads/meta-ads-shared'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
}))

vi.mock('swr', () => ({ default: (...args: unknown[]) => mocks.useSWR(...args) }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    lang: 'tr',
    t: {
      ads: {
        metaAccessReadOnlyLabel: 'Yalnızca raporlama',
        metaAccessManagedLabel: 'Yönetim izni',
        metaConnectionManagedBody: 'Bağlantı kampanya yönetimini destekler.',
        metaConnectionReadOnlyBody: 'Bağlantı raporları gösterir.',
        metaConnectReadScopesNote: 'Raporlama izinleri kullanılır.',
      },
    },
  }),
}))

import { MetaAdsSettings } from '@/components/ads/meta-ads-settings'

const account = {
  externalAccountId: 'act_123456',
  name: 'Gloval mağaza',
  currency: 'TRY',
  accountStatus: 1,
}

const page = { pageId: 'page-123', pageName: 'Gloval Sayfası' }

const connection = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  externalAccountId: 'act_123456',
  name: 'Gloval mağaza',
  currency: 'TRY',
  status: 'active',
  hasPage: true,
  pageName: 'Gloval Sayfası',
  missingPublishScopes: [],
  missingOptionalScopes: [],
  tokenExpiresAt: null,
  accountStatus: 1,
} as unknown as MetaConnectionView

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSWR.mockReturnValue({ data: { accounts: [account], pages: [page] }, isLoading: false })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MetaAdsSettings', () => {
  it('preserves the Meta workspace and refreshes server data after account selection', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<MetaAdsSettings connections={[]} pendingFlowId="flow-123" status={null} missingScopes={null} />)

    fireEvent.click(screen.getByRole('radio', { name: /Gloval mağaza/ }))
    fireEvent.change(screen.getByLabelText('Facebook Sayfası (zorunlu)'), { target: { value: page.pageId } })
    fireEvent.click(screen.getByRole('button', { name: 'Hesabı bağla' }))

    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce())
    expect(mocks.router.replace).toHaveBeenCalledWith('/ads/dashboard?platform=meta#settings')
    expect(fetchMock).toHaveBeenCalledWith('/api/ads/meta/select', expect.objectContaining({ method: 'POST' }))
  })

  it('shows a reconnect badge instead of the account state when the connection is in error', () => {
    const errored = { ...connection, status: 'error' } as unknown as MetaConnectionView
    render(<MetaAdsSettings connections={[errored]} pendingFlowId={null} status={null} missingScopes={null} />)

    expect(screen.getByText('Yeniden bağlantı gerekiyor')).toBeTruthy()
    expect(screen.getByText(/Meta oturumunuz sona erdi/)).toBeTruthy()
  })

  describe('reconnect intent', () => {
    function intentOf(button: HTMLElement) {
      const form = button.closest('form')
      expect(form?.getAttribute('action')).toBe('/api/ads/meta/connect')
      return (form?.querySelector('input[name="intent"]') as HTMLInputElement | null)?.value ?? null
    }

    it('sends intent=manage when ads_management was granted and the user can publish', () => {
      const errored = { ...connection, status: 'error', missingPublishScopes: [] } as unknown as MetaConnectionView
      render(<MetaAdsSettings connections={[errored]} pendingFlowId={null} status={null} missingScopes={null} canPublish />)

      expect(intentOf(screen.getByRole('button', { name: 'Yeniden bağla' }))).toBe('manage')
    })

    it('still sends intent=manage when only pages_read_engagement is missing', () => {
      const errored = { ...connection, status: 'error', missingPublishScopes: ['pages_read_engagement'] } as unknown as MetaConnectionView
      render(<MetaAdsSettings connections={[errored]} pendingFlowId={null} status={null} missingScopes={null} canPublish />)

      expect(intentOf(screen.getByRole('button', { name: 'Yeniden bağla' }))).toBe('manage')
    })

    it('sends no intent when ads_management is not in the connection scopes', () => {
      const errored = { ...connection, status: 'error', missingPublishScopes: ['ads_management'] } as unknown as MetaConnectionView
      render(<MetaAdsSettings connections={[errored]} pendingFlowId={null} status={null} missingScopes={null} canPublish />)

      expect(intentOf(screen.getByRole('button', { name: 'Yeniden bağla' }))).toBeNull()
    })

    it('sends no intent when the user cannot publish', () => {
      const errored = { ...connection, status: 'error', missingPublishScopes: [] } as unknown as MetaConnectionView
      render(<MetaAdsSettings connections={[errored]} pendingFlowId={null} status={null} missingScopes={null} />)

      expect(intentOf(screen.getByRole('button', { name: 'Yeniden bağla' }))).toBeNull()
    })

    it('keeps the first connection read-only and single-stage', () => {
      render(<MetaAdsSettings connections={[]} pendingFlowId={null} status={null} missingScopes={null} canPublish />)

      expect(intentOf(screen.getByRole('button', { name: 'Meta hesabını bağla' }))).toBeNull()
    })
  })

  it('refreshes server data after a successful disconnect', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    render(<MetaAdsSettings connections={[connection]} pendingFlowId={null} status={null} missingScopes={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı kes' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Bağlantıyı kes' }))

    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith('/api/ads/meta/disconnect', expect.objectContaining({ method: 'POST' }))
  })
})
