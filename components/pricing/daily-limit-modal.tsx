'use client'

import { useEffect, useState } from 'react'
import { Clock, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FREE_DAILY_LIMIT } from '@/lib/pricing-config'

/** Formats the remaining time until `resetAt` as "Xs Yd" (Turkish h/m). */
function useCountdown(resetAt: string | null) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!resetAt) return
    const target = new Date(resetAt).getTime()

    function tick() {
      const diffMs = target - Date.now()
      if (diffMs <= 0) {
        setLabel('birazdan')
        return
      }
      const totalMinutes = Math.ceil(diffMs / 60000)
      const hours = Math.floor(totalMinutes / 60)
      const minutes = totalMinutes % 60
      setLabel(hours > 0 ? `${hours}s ${minutes}d` : `${minutes}d`)
    }

    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [resetAt])

  return label
}

/**
 * Shown when the FREE-plan rolling-24h daily action limit is hit — see
 * `lib/free-daily-limit.ts`. Distinct from `OutOfCreditsModal`: this can fire
 * even with AI credits remaining, and resolves on its own once the window
 * rolls over, so it surfaces a countdown instead of a top-up purchase flow.
 */
export function DailyLimitModal({
  open,
  onClose,
  resetAt,
  upgradeHref = '/billing',
  onBeforeUpgrade,
}: {
  open: boolean
  onClose: () => void
  resetAt: string | null
  upgradeHref?: string
  /**
   * Runs before navigating to the upgrade page. Must resolve `true` once the
   * current draft is safely saved; on `false` the navigation is cancelled so a
   * failed save can never lose the visitor's site.
   */
  onBeforeUpgrade?: () => Promise<boolean>
}) {
  const router = useRouter()
  const countdown = useCountdown(resetAt)
  const [busy, setBusy] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  if (!open) return null

  async function handleUpgrade() {
    if (busy) return
    setBusy(true)
    setSaveFailed(false)
    try {
      const saved = onBeforeUpgrade ? await onBeforeUpgrade() : true
      if (!saved) {
        setSaveFailed(true)
        return
      }
      router.push(upgradeHref)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={FREE_DAILY_LIMIT.title}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-up relative w-full max-w-md rounded-2xl border border-brand/30 bg-card p-6 glow-primary"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand">
          <Clock className="h-5 w-5" />
        </span>

        <h2 className="mt-4 text-balance font-display text-lg font-semibold leading-snug">
          {FREE_DAILY_LIMIT.title}
        </h2>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {FREE_DAILY_LIMIT.description}
        </p>

        {countdown && (
          <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-center text-sm font-medium text-foreground">
            Yenilenmeye kalan süre: {countdown}
          </p>
        )}

        {saveFailed && (
          <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Taslağınız kaydedilemedi. Değişiklikleriniz bu sayfada duruyor; lütfen tekrar deneyin.
          </p>
        )}

        <Button
          type="button"
          size="lg"
          className="mt-4 h-10 w-full bg-brand text-brand-foreground hover:bg-brand/90"
          onClick={handleUpgrade}
          disabled={busy}
        >
          {busy ? 'Taslak kaydediliyor…' : FREE_DAILY_LIMIT.upgradeCta}
        </Button>
      </div>
    </div>
  )
}
