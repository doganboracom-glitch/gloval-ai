'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Package, ClipboardList, ExternalLink, CreditCard, Loader2, Check, Users } from 'lucide-react'
import { archiveProduct, deleteProduct, saveProduct, type ProductRow, type CategoryRow } from '@/lib/ecommerce'
import { formFromProduct, toProductInput } from '@/lib/product-form'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from './form-parts'
import type { OwnerCollection } from '@/lib/store-collections-core'
import { CollectionsPanel } from './collections-panel'
import { ProductFormDialog } from './product-form-dialog'
import { ProductList } from './product-list'

type FormTarget = { product: ProductRow | null } | null

export function EcommerceClient({
  projectId,
  projectName,
  initialProducts,
  initialCategories,
  initialCollections,
  collectionsAvailable,
  storeSlug,
  published,
}: {
  projectId: string
  projectName: string
  initialProducts: ProductRow[]
  initialCategories: CategoryRow[]
  initialCollections: OwnerCollection[]
  collectionsAvailable: boolean
  storeSlug?: string | null
  published?: boolean
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const [formTarget, setFormTarget] = useState<FormTarget>(null)
  const [removeTarget, setRemoveTarget] = useState<ProductRow | null>(null)
  const [removeNotice, setRemoveNotice] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const products = initialProducts

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  function handleSaved(product: ProductRow, mode: 'created' | 'updated') {
    setFormTarget(null)
    setToast(mode === 'created' ? `“${product.name}” eklendi.` : `“${product.name}” güncellendi.`)
    router.refresh()
  }

  function closeRemove() {
    setRemoveTarget(null)
    setRemoveNotice(null)
  }

  function handlePublish(product: ProductRow) {
    setPublishingId(product.id)
    startTransition(async () => {
      try {
        const input = toProductInput({ ...formFromProduct(product), status: 'active' })
        const result = await saveProduct(projectId, product.id, input)
        if (result.ok) {
          setToast(`“${product.name}” yayına alındı.`)
          router.refresh()
        } else {
          setToast(
            result.errors.length > 0
              ? `“${product.name}” yayına alınamadı: ürün bilgilerinde eksik var. Düzenleyip kaydedin.`
              : 'Ürün yayına alınamadı. Lütfen tekrar deneyin.',
          )
        }
      } catch {
        setToast('Ürün yayına alınamadı. Lütfen tekrar deneyin.')
      } finally {
        setPublishingId(null)
      }
    })
  }

  function handleArchive(product: ProductRow) {
    startTransition(async () => {
      try {
        await archiveProduct(projectId, product.id)
        closeRemove()
        setToast(`“${product.name}” arşivlendi.`)
        router.refresh()
      } catch {
        setRemoveNotice('Ürün arşivlenemedi. Lütfen tekrar deneyin.')
      }
    })
  }

  function handleDelete(product: ProductRow) {
    startTransition(async () => {
      try {
        const result = await deleteProduct(projectId, product.id)
        if (!result.ok) {
          setRemoveNotice('Bu ürün siparişlerde yer aldığı için kalıcı olarak silinemez. Mağazadan kaldırmak için arşivleyebilirsiniz.')
          return
        }
        closeRemove()
        setToast(`“${product.name}” silindi.`)
        router.refresh()
      } catch {
        setRemoveNotice('Ürün silinemedi. Lütfen tekrar deneyin.')
      }
    })
  }

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t.ecom.backToDash}
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={`/ecommerce/${projectId}/orders`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              <ClipboardList className="size-4" />
              {t.ecom.orders}
            </Link>
            <Link
              href={`/ecommerce/${projectId}/customers`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              <Users className="size-4" />
              Müşteriler
            </Link>
            <Link
              href={`/ecommerce/${projectId}/odeme`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
            >
              <CreditCard className="size-4" />
              {t.ecom.paymentSettings}
            </Link>
            {published && storeSlug && (
              <a
                href={`/site/${storeSlug}/store`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40"
              >
                {t.ecom.viewStore}
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Package className="size-5" />
              <span className="text-sm font-medium uppercase tracking-wide">{projectName}</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance">{t.ecom.title}</h1>
            <p className="mt-1 text-muted-foreground">
              {t.ecom.subtitle} · {products.length} {t.ecom.noProducts}
            </p>
          </div>
          <Button onClick={() => setFormTarget({ product: null })} size="lg" className="gap-2 self-start sm:self-auto">
            <Plus className="size-4" />
            {t.ecom.addProduct}
          </Button>
        </div>

        <ProductList
          products={products}
          categories={initialCategories}
          publishingId={publishingId}
          onAdd={() => setFormTarget({ product: null })}
          onEdit={(product) => setFormTarget({ product })}
          onRemove={setRemoveTarget}
          onPublish={handlePublish}
        />

        <CollectionsPanel
          projectId={projectId}
          collections={initialCollections}
          products={products}
          available={collectionsAvailable}
        />
      </div>

      {formTarget && (
        <ProductFormDialog
          key={formTarget.product?.id ?? 'new'}
          projectId={projectId}
          product={formTarget.product}
          categories={initialCategories}
          collections={collectionsAvailable ? initialCollections : []}
          onClose={() => setFormTarget(null)}
          onSaved={handleSaved}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          title={`“${removeTarget.name}” ürününü ne yapalım?`}
          description={
            <>
              <p>
                <strong className="text-foreground">Arşivle:</strong> ürün mağazadan kalkar, bilgileri ve siparişleri korunur. İstediğiniz zaman yeniden etkinleştirebilirsiniz.
              </p>
              <p className="mt-2">
                <strong className="text-foreground">Kalıcı sil:</strong> geri alınamaz. Siparişi olan ürünler silinemez.
              </p>
              {removeNotice && (
                <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                  {removeNotice}
                </p>
              )}
            </>
          }
          onDismiss={closeRemove}
        >
          <Button variant="ghost" onClick={closeRemove} disabled={isPending}>
            Vazgeç
          </Button>
          <button
            type="button"
            onClick={() => handleDelete(removeTarget)}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/50 px-4 text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/50 disabled:opacity-60"
          >
            Kalıcı olarak sil
          </button>
          {removeTarget.status !== 'archived' && (
            <Button data-autofocus onClick={() => handleArchive(removeTarget)} disabled={isPending} className="gap-2">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Arşivle
            </Button>
          )}
        </ConfirmDialog>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm shadow-xl"
        >
          <Check className="size-4 text-accent" />
          {toast}
        </div>
      )}
    </div>
  )
}
