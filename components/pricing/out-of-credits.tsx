'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreditRulesLink } from '@/components/pricing/credit-rules-link'
import { formatMoney } from '@/lib/billing-utils'
import {
  CREDIT_TOPUPS,
  OUT_OF_CREDITS,
  type CreditTopUp,
} from '@/lib/pricing-config'

/**
 * AI kredisi bittiğinde hata mesajı yerine gösterilen ekran.
 *
 * Paket seçilince, `onPurchase` verilmediyse kullanıcı `/billing?topup=<id>`
 * adresine yönlendirilir: orada alıcı bilgileri ve yasal onaylar toplanır, ardından
 * ödeme başlar. Fiyat ve kredi miktarı sunucuda katalogdan okunur.
 */
export function OutOfCreditsPanel({
  onPurchase,
  className,
}: {
  onPurchase?: (topUp: CreditTopUp) => Promise<void> | void
  className?: string
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<CreditTopUp['id'] | null>(null)

  async function handlePurchase(topUp: CreditTopUp) {
    if (pendingId) return
    setPendingId(topUp.id)
    try {
      if (onPurchase) {
        await onPurchase(topUp)
      } else {
        router.push(`/billing?topup=${topUp.id}`)
        return
      }
    } catch {
      // handled by the caller; just release the button
    }
    setPendingId(null)
  }

  return (
    <div className={className}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand">
        <Sparkles className="h-5 w-5" />
      </span>

      <h2 className="mt-4 text-balance font-display text-lg font-semibold leading-snug">
        {OUT_OF_CREDITS.title}
      </h2>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
        {OUT_OF_CREDITS.description}
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {CREDIT_TOPUPS.map((topUp) => (
          <Button
            key={topUp.id}
            type="button"
            variant="secondary"
            disabled={pendingId !== null}
            onClick={() => handlePurchase(topUp)}
            className="h-auto w-full flex-col gap-0.5 py-2"
          >
            {pendingId === topUp.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span className="font-semibold">+{topUp.credits} işlem</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {formatMoney(topUp.priceCents, topUp.currency)}
                </span>
              </>
            )}
          </Button>
        ))}
      </div>

      <p className="mt-4 text-pretty text-center text-sm leading-relaxed text-muted-foreground">
        Bunun bir sorun veya yanlışlık olduğunu düşünüyorsanız{' '}
        <Link
          href="/support/new"
          className="font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          DESTEK
        </Link>{' '}
        talebi oluşturun.
      </p>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        <CreditRulesLink />
      </p>
    </div>
  )
}

/** Aynı ekranın modal kabuğu — editör içinden tetiklenir. */
export function OutOfCreditsModal({
  open,
  onClose,
  onPurchase,
}: {
  open: boolean
  onClose: () => void
  onPurchase?: (topUp: CreditTopUp) => Promise<void> | void
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={OUT_OF_CREDITS.title}
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
        <OutOfCreditsPanel onPurchase={onPurchase} />
      </div>
    </div>
  )
}
