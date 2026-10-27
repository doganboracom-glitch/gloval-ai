'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle2, CircleAlert, X } from 'lucide-react'

export interface PaymentNotice {
  status: 'success' | 'failed'
  text: string
}

/**
 * Persistent (never auto-dismissed) result notice shown at the top of /billing.
 */
export function PaymentNoticeBanner({
  notice,
  dismissLabel,
  onDismiss,
}: {
  notice: PaymentNotice
  dismissLabel: string
  onDismiss: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const success = notice.status === 'success'
  const Icon = success ? CheckCircle2 : CircleAlert

  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [notice])

  return (
    <div
      ref={ref}
      role={success ? 'status' : 'alert'}
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
        success ? 'border-success/50 bg-success/10' : 'border-destructive/50 bg-destructive/10'
      }`}
    >
      <Icon
        className={`mt-0.5 size-5 shrink-0 ${success ? 'text-success' : 'text-destructive'}`}
        aria-hidden="true"
      />
      <p className="flex-1 text-pretty font-medium leading-6 text-foreground">{notice.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-m-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
