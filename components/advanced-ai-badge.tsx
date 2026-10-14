'use client'

import { useState } from 'react'
import { Lock, Sparkles } from 'lucide-react'
import { UpgradeModal } from '@/components/pricing/upgrade-modal'
import { ADVANCED_AI_DISTINCT, advancedAiVisibleFor } from '@/lib/ai-models'
import { cn } from '@/lib/utils'
import type { PlanCode } from '@/lib/pricing-config'

const COPY = {
  tr: { active: 'Gelişmiş AI', locked: 'Gelişmiş AI: PRO', title: 'Bu işlemler gelişmiş AI modeliyle çalışıyor.' },
  en: { active: 'Advanced AI', locked: 'Advanced AI: PRO', title: 'These actions run on the advanced AI model.' },
} as const

/**
 * PRO / E-Ticaret see a quiet "Gelişmiş AI" mark; FREE / STARTER / anonymous
 * see the same mark locked, which opens the upgrade prompt. Renders nothing
 * while the plan is unknown or while the advanced model is not actually
 * different from the standard one.
 */
export function AdvancedAiBadge({
  planCode,
  lang = 'tr',
  className,
  onBeforeUpgrade,
}: {
  planCode: PlanCode | null
  lang?: 'tr' | 'en'
  className?: string
  onBeforeUpgrade?: () => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  if (!ADVANCED_AI_DISTINCT || !planCode) return null
  const copy = COPY[lang]

  if (advancedAiVisibleFor(planCode)) {
    return (
      <span
        title={copy.title}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand',
          className,
        )}
      >
        <Sparkles className="h-3 w-3" aria-hidden="true" />
        {copy.active}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Lock className="h-3 w-3" aria-hidden="true" />
        {copy.locked}
      </button>
      <UpgradeModal
        featureKey={open ? 'advancedAi' : null}
        onClose={() => setOpen(false)}
        linkPrefix="/"
        onBeforeUpgrade={onBeforeUpgrade}
      />
    </>
  )
}
