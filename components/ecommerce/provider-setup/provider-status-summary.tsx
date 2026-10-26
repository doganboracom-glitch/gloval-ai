'use client'

import { ArrowRight, Loader2 } from 'lucide-react'
import {
  deriveSetupStatus,
  type Lang,
  type ProviderSetupConfig,
  type ProviderSetupStatus,
} from '@/lib/payment-providers/types'
import { useProviderSetup } from '@/components/ecommerce/provider-setup/use-provider-setup'

const copy = {
  tr: {
    status: {
      setup_required: 'Kurulum gerekli',
      not_ready: 'Hazırlık eksik',
      applied: 'Başvuru yapıldı',
      connected: 'Bağlı ve test edildi',
    } satisfies Record<ProviderSetupStatus, string>,
    hint: {
      setup_required: (name: string) => `${name} hesabı açıp anahtarlarını girerek kart ödemesini başlat.`,
      not_ready: (name: string) => `${name} incelemesi öncesi sitedeki eksikleri tamamla.`,
      applied: () => 'Hesabın açılınca API anahtarlarını girip bağlantıyı test et.',
      connected: () => 'Kart ödemesi için anahtarların doğrulandı.',
    },
    open: 'Kurulumu aç',
    manage: 'Ayarları aç',
    loading: 'Durum okunuyor…',
    failed: 'Durum okunamadı',
  },
  en: {
    status: {
      setup_required: 'Setup required',
      not_ready: 'Not ready yet',
      applied: 'Applied',
      connected: 'Connected and tested',
    } satisfies Record<ProviderSetupStatus, string>,
    hint: {
      setup_required: (name: string) => `Open a ${name} account and enter its keys to start taking card payments.`,
      not_ready: (name: string) => `Fix the gaps on your site before the ${name} review.`,
      applied: () => 'Once your account is open, enter the API keys and test the connection.',
      connected: () => 'Your keys are verified for card payments.',
    },
    open: 'Open setup',
    manage: 'Open settings',
    loading: 'Reading status…',
    failed: 'Status unavailable',
  },
}

const badgeClass: Record<ProviderSetupStatus, string> = {
  setup_required: 'bg-muted text-muted-foreground',
  not_ready: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  applied: 'bg-brand/15 text-brand',
  connected: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
}

/** One-line provider status shown outside the settings window; opens the provider's tab. */
export function ProviderStatusSummary({
  config,
  projectId,
  lang,
  recheckKey = 0,
  onOpen,
}: {
  config: ProviderSetupConfig
  projectId: string
  lang: Lang
  recheckKey?: number
  onOpen: () => void
}) {
  const c = copy[lang]
  const { data, error } = useProviderSetup(config, projectId, recheckKey)
  const status = data ? deriveSetupStatus(data) : null

  return (
    <section
      aria-label={config.name}
      className="flex flex-col gap-2 rounded-lg border border-border p-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{config.name}</h3>
        {status ? (
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass[status]}`}>
            {c.status[status]}
          </span>
        ) : error ? (
          <span className="ml-auto text-xs text-muted-foreground">{c.failed}</span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-busy="true">
            <Loader2 className="size-3.5 animate-spin" /> {c.loading}
          </span>
        )}
      </div>
      {status && <p className="text-xs leading-relaxed text-muted-foreground">{c.hint[status](config.name)}</p>}
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {status === 'connected' ? c.manage : c.open}
        <ArrowRight className="size-4" aria-hidden />
      </button>
    </section>
  )
}
