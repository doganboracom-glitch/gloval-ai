'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Package,
  Pencil,
  X,
  ClipboardList,
  ExternalLink,
  CreditCard,
} from 'lucide-react'
import {
  createProduct,
  updateProduct,
  deleteProduct,
  type ProductRow,
  type CategoryRow,
  type ProductStatus,
} from '@/lib/ecommerce'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'

type FormState = {
  name: string
  description: string
  price: string
  currency: string
  stock: string
  trackStock: boolean
  sku: string
  status: ProductStatus
  categoryId: string
}

const emptyForm: FormState = {
  name: '',
  description: '',
  price: '',
  currency: 'TRY',
  stock: '0',
  trackStock: false,
  sku: '',
  status: 'active',
  categoryId: '',
}

export function EcommerceClient({
  projectId,
  projectName,
  initialProducts,
  initialCategories,
  storeSlug,
  published,
}: {
  projectId: string
  projectName: string
  initialProducts: ProductRow[]
  initialCategories: CategoryRow[]
  storeSlug?: string | null
  published?: boolean
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [categories] = useState<CategoryRow[]>(initialCategories)
  const [editing, setEditing] = useState<ProductRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const products = initialProducts

  const currencyFmt = useMemo(
    () =>
      new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 2,
      }),
    [lang],
  )

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? t.ecom.noCategory

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setShowForm(true)
  }

  function openEdit(p: ProductRow) {
    setEditing(p)
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: (p.price_cents / 100).toString(),
      currency: p.currency,
      stock: p.stock.toString(),
      trackStock: p.track_stock !== false,
      sku: p.sku ?? '',
      status: p.status,
      categoryId: p.category_id ?? '',
    })
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const priceCents = Math.round(Number(form.price.replace(',', '.')) * 100)
    const stock = Math.round(Number(form.stock))
    if (!form.name.trim() || !Number.isFinite(priceCents) || priceCents < 0) {
      setError(t.ecom.saveError)
      return
    }
    const payload = {
      name: form.name,
      description: form.description,
      priceCents,
      currency: form.currency,
      stock: form.trackStock && Number.isFinite(stock) && stock >= 0 ? stock : 0,
      trackStock: form.trackStock,
      sku: form.sku,
      status: form.status,
      categoryId: form.categoryId || null,
    }
    startTransition(async () => {
      try {
        if (editing) {
          await updateProduct(projectId, editing.id, payload)
        } else {
          await createProduct(projectId, payload)
        }
        closeForm()
        router.refresh()
      } catch {
        setError(t.ecom.saveError)
      }
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm(t.ecom.deleteConfirm)) return
    setPendingDeleteId(id)
    startTransition(async () => {
      try {
        await deleteProduct(projectId, id)
      } finally {
        setPendingDeleteId(null)
        router.refresh()
      }
    })
  }

  const statusLabel = (s: ProductStatus) =>
    s === 'active' ? t.ecom.statusActive : s === 'draft' ? t.ecom.statusDraft : t.ecom.statusArchived

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
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance">
              {t.ecom.title}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {t.ecom.subtitle} · {products.length} {t.ecom.noProducts}
            </p>
          </div>
          <Button onClick={openNew} size="lg" className="gap-2 self-start sm:self-auto">
            <Plus className="size-4" />
            {t.ecom.addProduct}
          </Button>
        </div>

        {products.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Package className="size-7" />
            </div>
            <p className="mt-5 text-lg font-medium">{t.ecom.empty}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.ecom.emptyCta}</p>
            <Button onClick={openNew} className="mt-6 gap-2">
              <Plus className="size-4" />
              {t.ecom.addProduct}
            </Button>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.images[0] || '/placeholder.svg'}
                      alt={p.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <Package className="size-5 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-medium">{p.name}</h2>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === 'active'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {categoryName(p.category_id)}
                    {p.sku ? ` · ${p.sku}` : ''}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className="font-medium">{currencyFmt.format(p.price_cents / 100)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.ecom.stock}: {p.track_stock === false ? t.ecom.stockUntracked : p.stock}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    aria-label={t.ecom.editProduct}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={isPending && pendingDeleteId === p.id}
                    aria-label={t.ecom.delete}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    {isPending && pendingDeleteId === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-6 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">
                {editing ? t.ecom.editProduct : t.ecom.newProduct}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label={t.ecom.cancel}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <Field label={t.ecom.name} required>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className={inputCls}
                />
              </Field>

              <Field label={t.ecom.description}>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className={`${inputCls} h-auto resize-y py-2`}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t.ecom.price} required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    required
                    className={inputCls}
                  />
                </Field>
                <Field label={t.ecom.stock}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={form.trackStock ? form.stock : ''}
                    placeholder={form.trackStock ? undefined : t.ecom.stockUntracked}
                    disabled={!form.trackStock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-60`}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t.ecom.sku}>
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    className={inputCls}
                  />
                </Field>
                <Field label={t.ecom.status}>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value as ProductStatus }))
                    }
                    className={inputCls}
                  >
                    <option value="active">{t.ecom.statusActive}</option>
                    <option value="draft">{t.ecom.statusDraft}</option>
                    <option value="archived">{t.ecom.statusArchived}</option>
                  </select>
                </Field>
              </div>

              {categories.length > 0 && (
                <Field label={t.ecom.category}>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">{t.ecom.noCategory}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {error && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="mt-2 flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeForm}>
                  {t.ecom.cancel}
                </Button>
                <Button type="submit" disabled={isPending} className="gap-2">
                  {isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t.ecom.saving}
                    </>
                  ) : (
                    t.ecom.save
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const inputCls =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {children}
    </label>
  )
}
