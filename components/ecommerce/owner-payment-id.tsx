'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { OWNER_PAYMENT_ID_COPY } from '@/lib/owner-payment-id'

export function OwnerPaymentId({ paymentId, lang }: { paymentId: string; lang: 'tr' | 'en' }) {
  const copy = OWNER_PAYMENT_ID_COPY[lang]
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(paymentId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>
        {copy.label}: <span className="select-all font-mono">{paymentId}</span>
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      >
        {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
        <span aria-live="polite">{copied ? copy.copied : copy.copy}</span>
      </button>
    </p>
  )
}
