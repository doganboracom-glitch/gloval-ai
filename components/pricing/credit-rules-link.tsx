'use client'

import { useState } from 'react'
import { CreditRulesDialog } from '@/components/pricing/credit-rules-dialog'

/**
 * "Kredi kullanım kuralları" linki + modalı.
 *
 * Kendi state'ini taşıdığı için fiyatlandırma sayfasında da, üye panelindeki
 * AI kredi göstergesinin yanında da tek satırda kullanılabilir.
 */
export function CreditRulesLink({
  label = 'AI işlemi kullanım kuralları',
  className,
}: {
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'font-medium text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        }
      >
        {label}
      </button>
      <CreditRulesDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
