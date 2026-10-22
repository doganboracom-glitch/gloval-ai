'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, PackageOpen } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { setCatalogEnabled } from '@/lib/catalog-feature-actions'
import { CATALOG_PLAN_WARNING } from '@/lib/catalog-feature'

export type CatalogFeatureState = {
  projectId: string
  enabled: boolean
  /** False when the owner's plan cannot use the catalog (shows the upgrade message). */
  planAllowed: boolean
}

const COPY = {
  tr: {
    title: 'Ürün kataloğu',
    intro:
      'Kurumsal sitenize sepetsiz bir ürün kataloğu ekleyin. Ziyaretçiler ürünleri inceler, WhatsApp veya telefonla size ulaşır.',
    on: 'Açık',
    off: 'Kapalı',
    enable: 'Kataloğu aç',
    disable: 'Kataloğu kapat',
    working: 'Kaydediliyor…',
    upgrade: 'Paketi yükselt',
    manage: 'Ürünleri yönet',
    openTitle: 'Ürün kataloğu açılsın mı?',
    openBody:
      'Sitenizde /urunlerimiz sayfaları oluşur. Sepet, ödeme ve stok yoktur. Site türünüz kurumsal olarak kalır ve istediğiniz zaman kapatabilirsiniz.',
    closeTitle: 'Ürün kataloğu kapatılsın mı?',
    closeBody:
      'Katalog sayfaları sitenizden kalkar. Ürünleriniz silinmez, kataloğu yeniden açtığınızda geri gelir.',
    confirmOpen: 'Evet, aç',
    confirmClose: 'Evet, kapat',
    cancel: 'Vazgeç',
    errors: {
      is_store: 'Bu site bir e-ticaret mağazası, katalog yalnızca kurumsal sitelerde açılır.',
      has_orders: 'Bu sitede siparişler var, katalog açılamaz.',
      not_found: 'Site bulunamadı.',
      update_failed: 'Kaydedilemedi, lütfen tekrar deneyin.',
      audit_failed: 'Değişiklik kaydedilemedi, hiçbir şey değişmedi. Lütfen tekrar deneyin.',
      already_enabled: 'Katalog zaten açık.',
      already_disabled: 'Katalog zaten kapalı.',
      feature_disabled: 'Özellik kapalı.',
    },
  },
  en: {
    title: 'Product catalog',
    intro:
      'Add a cart-free product catalog to your business site. Visitors browse products and reach you by WhatsApp or phone.',
    on: 'On',
    off: 'Off',
    enable: 'Turn on catalog',
    disable: 'Turn off catalog',
    working: 'Saving…',
    upgrade: 'Upgrade plan',
    manage: 'Manage products',
    openTitle: 'Turn on the product catalog?',
    openBody:
      'Your site gets /urunlerimiz pages. There is no cart, checkout or stock. Your site stays a business site and you can turn it off any time.',
    closeTitle: 'Turn off the product catalog?',
    closeBody:
      'Catalog pages are removed from your site. Your products are not deleted and come back when you turn the catalog on again.',
    confirmOpen: 'Yes, turn on',
    confirmClose: 'Yes, turn off',
    cancel: 'Cancel',
    errors: {
      is_store: 'This site is an online store. The catalog only works on business sites.',
      has_orders: 'This site has orders, so the catalog cannot be turned on.',
      not_found: 'Site not found.',
      update_failed: 'Could not save. Please try again.',
      audit_failed: 'The change could not be recorded, nothing was changed. Please try again.',
      already_enabled: 'The catalog is already on.',
      already_disabled: 'The catalog is already off.',
      feature_disabled: 'This feature is turned off.',
    },
  },
} as const

export function CatalogFeatureTab({
  state,
  lang,
}: {
  state: CatalogFeatureState
  lang: 'tr' | 'en'
}) {
  const router = useRouter()
  const c = COPY[lang]
  const [enabled, setEnabled] = useState(state.enabled)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const planBlocked = !enabled && !state.planAllowed

  function run() {
    setConfirming(false)
    setError(null)
    startTransition(async () => {
      const result = await setCatalogEnabled(state.projectId, !enabled)
      if (result.ok) {
        setEnabled(result.enabled)
        router.refresh()
        return
      }
      if (result.error === 'plan_required') {
        setError(lang === 'en' ? 'The product catalog is a PRO feature. Upgrade to PRO to turn it on.' : (result.message ?? CATALOG_PLAN_WARNING))
        return
      }
      setError(c.errors[result.error] ?? c.errors.update_failed)
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <PackageOpen className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {c.title}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-secondary text-muted-foreground'
              }`}
            >
              {enabled ? c.on : c.off}
            </span>
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.intro}</p>
        </div>
      </div>

      {planBlocked && (
        <div role="note" className="rounded-lg border border-brand/40 bg-brand/10 p-3 text-xs leading-relaxed text-foreground">
          <p>{lang === 'en' ? 'The product catalog is a PRO feature. Upgrade to PRO to turn it on.' : CATALOG_PLAN_WARNING}</p>
          <Link href="/billing" className="mt-2 inline-flex font-medium text-brand underline underline-offset-2">
            {c.upgrade}
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || planBlocked}
          onClick={() => setConfirming(true)}
          className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? 'border border-border bg-secondary/40 text-foreground' : 'bg-brand text-brand-foreground'
          }`}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {pending ? c.working : enabled ? c.disable : c.enable}
        </button>
        {enabled && (
          <Link
            href={`/ecommerce/${state.projectId}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-brand/40 px-3 text-sm font-medium text-brand hover:bg-brand/10"
          >
            {c.manage}
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={enabled ? c.closeTitle : c.openTitle}
        description={enabled ? c.closeBody : c.openBody}
        confirmLabel={enabled ? c.confirmClose : c.confirmOpen}
        cancelLabel={c.cancel}
        destructive={enabled}
        onConfirm={run}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
