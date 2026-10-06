'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, X } from 'lucide-react'
import { LinkButton } from '@/components/link-button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { UPGRADE_PROMPTS, type LockedFeatureKey } from '@/lib/pricing-config'

const buttonBase =
  'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Kilitli bir özelliğe dokunulduğunda hata yerine yükseltme yolu gösteren
 * modal. Hafif tutulur: shadcn Dialog yerine tek bir overlay kullanır, ama
 * Escape ile kapanma, dışına tıklayınca kapanma ve odak yönetimi vardır.
 *
 * `linkPrefix`, modalın fiyatlandırma bölümünün DIŞINDA (örn. site editörü)
 * kullanıldığı durumlar için: paket çıpaları ana sayfada yaşıyor.
 */
export function UpgradeModal({
  featureKey,
  onClose,
  linkPrefix = '',
  onBeforeUpgrade,
}: {
  featureKey: LockedFeatureKey | null
  onClose: () => void
  linkPrefix?: string
  /**
   * Anonim ziyaretçi giriş sayfasına gitmeden önce çalışır; taslağın güvenle
   * saklandığında `true` döner. `false` ise yönlendirme iptal edilir.
   */
  onBeforeUpgrade?: () => Promise<boolean>
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  // null = henüz bilinmiyor; bu sürede mevcut (çıpa) davranış korunur.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    if (!featureKey) return
    let cancelled = false
    setSaveFailed(false)
    setBusy(false)
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(Boolean(data.user))
      })
      .catch(() => {
        if (!cancelled) setSignedIn(null)
      })
    return () => {
      cancelled = true
    }
  }, [featureKey])

  async function goToLogin(plan: 'starter' | 'pro') {
    if (busy) return
    setBusy(true)
    setSaveFailed(false)
    try {
      const saved = onBeforeUpgrade ? await onBeforeUpgrade() : true
      if (!saved) {
        setSaveFailed(true)
        return
      }
      const target = `/billing?plan=${plan}#plan-${plan}`
      onClose()
      router.push(`/auth/login?next=${encodeURIComponent(target)}`)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!featureKey) return
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [featureKey, onClose])

  if (!featureKey) return null
  const prompt = UPGRADE_PROMPTS[featureKey]
  // Birincil CTA hangi pakete işaret ediyorsa çıpa da oraya gitsin.
  const primaryIsPro = prompt.primaryCta.includes('PRO')

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-up relative w-full max-w-md rounded-2xl border border-brand/30 bg-card p-6 glow-primary"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand">
          <Lock className="h-5 w-5" />
        </span>

        <h2
          id="upgrade-modal-title"
          className="mt-4 text-balance pr-8 font-display text-lg font-semibold leading-snug"
        >
          {prompt.title}
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {prompt.description}
        </p>

        {saveFailed && (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Taslağın kaydedilemedi, bu yüzden yönlendirme durduruldu. Lütfen tekrar dene.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {signedIn === false ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => goToLogin(primaryIsPro ? 'pro' : 'starter')}
                className={cn(buttonBase, 'bg-brand text-brand-foreground hover:opacity-90')}
              >
                {prompt.primaryCta}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => goToLogin(primaryIsPro ? 'starter' : 'pro')}
                className={cn(
                  buttonBase,
                  'bg-secondary text-secondary-foreground hover:bg-secondary/80',
                )}
              >
                {prompt.secondaryCta}
              </button>
            </>
          ) : (
            <>
              <LinkButton
                href={`${linkPrefix}#plan-${primaryIsPro ? 'pro' : 'starter'}`}
                variant="brand"
                onClick={onClose}
                className="flex-1"
              >
                {prompt.primaryCta}
              </LinkButton>
              <LinkButton
                href={`${linkPrefix}#plan-${primaryIsPro ? 'starter' : 'pro'}`}
                variant="secondary"
                onClick={onClose}
                className="flex-1"
              >
                {prompt.secondaryCta}
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
