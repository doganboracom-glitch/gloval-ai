'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TRY_ON_COPY } from '@/lib/try-on-copy'
import { TryOnDialog, type TryOnTarget } from './try-on-dialog'

/**
 * TryOnButton
 * -----------
 * Buyer-facing "AI ile üzerinde dene" trigger, shared by the real storefront
 * (`components/store/product-detail.tsx`) and every demo site's product detail
 * page (`components/demo-site/catalog-detail.tsx`).
 *
 * The dialog itself (`try-on-dialog.tsx`) is mounted only while open and is
 * portalled to <body>, so the server-rendered HTML of published sites is
 * unchanged. It is styled with the app's own shadcn tokens rather than a
 * demo's `--site-*` theme vars — it is a utility overlay, not on-page content.
 *
 * The buyer's uploaded photo is held only in local component state (as a
 * data URL) and sent straight to `/api/try-on` — it is never persisted.
 */
export function TryOnButton({
  productImage,
  productName,
  lang = 'tr',
  target,
  trigger,
}: {
  productImage: string
  productName: string
  lang?: 'tr' | 'en'
  target: TryOnTarget
  /**
   * Custom trigger rendering for pages that use their own theme (demo sites
   * theme via `--site-*` vars instead of shadcn tokens). Receives an
   * `onClick` to open the modal; the caller owns all visual styling.
   */
  trigger?: (props: { onClick: () => void }) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const openDialog = () => setOpen(true)

  return (
    <>
      {trigger ? (
        trigger({ onClick: openDialog })
      ) : (
        <Button type="button" variant="outline" size="lg" className="gap-2" onClick={openDialog}>
          <Sparkles className="size-4" />
          {TRY_ON_COPY[lang].cta}
        </Button>
      )}

      {open && (
        <TryOnDialog
          productImage={productImage}
          productName={productName}
          lang={lang}
          target={target}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
