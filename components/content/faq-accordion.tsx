'use client'

import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { getLocalized, type FaqItem } from '@/lib/content/types'

/**
 * Shared FAQ accordion used by both the homepage summary and the /sss page, so
 * the two can never drift apart in behavior or styling.
 *
 * Accessibility: each question is a real <button> with aria-expanded and
 * aria-controls pointing at its panel, which gives keyboard and screen-reader
 * users the expected semantics without any custom key handling.
 */
export function FaqAccordion({
  items,
  /** Index open on first render. Pass null to start fully collapsed. */
  defaultOpen = 0,
}: {
  items: FaqItem[]
  defaultOpen?: number | null
}) {
  const { lang } = useLanguage()
  const [open, setOpen] = useState<string | null>(
    defaultOpen === null ? null : (items[defaultOpen]?.id ?? null),
  )
  // Namespaced so multiple accordions on one page cannot collide on element ids.
  const domId = useId()

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {items.map((item) => {
        const isOpen = open === item.id
        const panelId = `${domId}-${item.id}-panel`
        const buttonId = `${domId}-${item.id}-button`
        return (
          <div key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                onClick={() => setOpen(isOpen ? null : item.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="font-medium leading-snug">{getLocalized(item.question, lang)}</span>
                <Plus
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isOpen ? 'rotate-45 text-primary' : ''
                  }`}
                />
              </button>
            </h3>
            {/* `hidden` (not just visually clipped) so collapsed answers are
                removed from the a11y tree and tab order, matching what a sighted
                user sees. The trade-off is that find-in-page won't match
                collapsed text, which is why /sss has its own search box. */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-5 pb-5"
            >
              <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                {getLocalized(item.answer, lang)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
