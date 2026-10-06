'use client'

import { useEffect, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import {
  CREDIT_COSTS,
  CREDIT_RULES_BY_PLAN,
  CREDIT_RULES_DESCRIPTION,
  CREDIT_RULES_TITLE,
} from '@/lib/pricing-config'

/**
 * AI kredi kurallarının TEK kaynağı olan içerik bloğu.
 *
 * Hem fiyatlandırma sayfasındaki "Kredi kurallarını gör" modalı hem de üye
 * panelindeki "Kredi kullanım kuralları" linki aynı içeriği gösterir; bu yüzden
 * içerik ayrı bir bileşen olarak duruyor ve kabuğu (modal / accordion) çağıran
 * taraf seçiyor.
 */
export function CreditRulesContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
        {CREDIT_RULES_DESCRIPTION}
      </p>

      <section>
        <h3 className="font-display text-sm font-semibold">
          Paketlere göre AI işlemleri
        </h3>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {CREDIT_RULES_BY_PLAN.map((item) => (
            <li
              key={item.plan}
              className={`rounded-xl border p-4 ${
                item.plan === 'pro'
                  ? 'border-brand/35 bg-brand/8'
                  : 'border-border bg-secondary/30'
              }`}
            >
              <p className="font-display text-[11px] font-bold tracking-widest text-muted-foreground">
                {item.name}
              </p>
              <p className="mt-1.5 text-sm font-semibold">{item.amount}</p>
              {item.lines.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {item.lines.map((line) => (
                    <li
                      key={line}
                      className="text-xs leading-relaxed text-muted-foreground"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-display text-sm font-semibold">
          Örnek AI işlem kullanımları
        </h3>
        <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
          {CREDIT_COSTS.map((item) => (
            <li
              key={item.action}
              className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0"
            >
              <span className="text-muted-foreground">{item.action}</span>
              <span className="shrink-0 font-medium tabular-nums text-brand">
                {item.credits} AI işlemi
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/**
 * Kredi kurallarını modal olarak gösterir. Escape ve dışına tıklama ile
 * kapanır; açıldığında odak kapatma düğmesine taşınır.
 */
export function CreditRulesDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-rules-title"
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-up relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-brand/30 bg-card p-6 glow-primary"
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
          <Sparkles className="h-5 w-5" />
        </span>

        <h2
          id="credit-rules-title"
          className="mt-4 text-balance pr-8 font-display text-lg font-semibold leading-snug"
        >
          {CREDIT_RULES_TITLE}
        </h2>

        <div className="mt-4">
          <CreditRulesContent />
        </div>
      </div>
    </div>
  )
}
