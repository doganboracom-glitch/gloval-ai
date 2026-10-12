'use client'

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  discardProductImages,
  saveProduct,
  type CategoryRow,
  type ProductRow,
  type SaveProductResult,
} from '@/lib/ecommerce'
import { PRODUCT_LIMITS, type ProductStatus } from '@/lib/product-input'
import { setProductCollections } from '@/lib/store-collections-actions'
import type { OwnerCollection } from '@/lib/store-collections-core'
import {
  DEFAULT_OPEN_SECTIONS,
  SECTION_IDS,
  SECTION_TITLES,
  applyProductFields,
  errorCountBySection,
  errorsToMessages,
  fieldDomId,
  fieldsTouchedBy,
  formFromProduct,
  isFormDirty,
  sectionOfField,
  sectionSummary,
  sortFieldsByForm,
  validateProductForm,
  type FieldErrors,
  type ProductFormFields,
  type ProductFormState,
  type SectionId,
} from '@/lib/product-form'
import { ConfirmDialog, Field, FormSection, controlProps, inputClass, trapTab } from './form-parts'
import { ProductImageEditor } from './product-image-editor'
import { ProductAiAssistant, type AiApplyChange } from './product-ai-assistant'
import { ProductAiImageAssistant } from './product-ai-image-assistant'

export type ProductFormHandle = {
  /** Fills fields from outside (e.g. an AI assistant). Marks the form dirty, never saves. */
  applyFields: (fields: ProductFormFields) => void
}

type Props = {
  projectId: string
  product: ProductRow | null
  categories: CategoryRow[]
  collections?: OwnerCollection[]
  onClose: () => void
  onSaved: (product: ProductRow, mode: 'created' | 'updated') => void
  formRef?: Ref<ProductFormHandle>
}

const LIMIT_MESSAGE = 'Ürün limitinize ulaştınız. Yeni ürün eklemek için planınızı yükseltin veya ek ürün paketi alın.'
const UNEXPECTED_MESSAGE = 'Ürün kaydedilemedi. Lütfen bir süre sonra tekrar deneyin.'

function fieldLabel(field: string): string {
  const [root, index, part] = field.split('.')
  switch (root) {
    case 'name':
      return 'Ürün adı'
    case 'description':
      return 'Açıklama'
    case 'categoryId':
      return 'Kategori'
    case 'images':
      return 'Görseller'
    case 'price':
      return 'Satış fiyatı'
    case 'compareAtPrice':
      return 'Eski fiyat'
    case 'vatRate':
      return 'KDV oranı'
    case 'stock':
      return 'Stok adedi'
    case 'shippingNote':
      return 'Hazırlık süresi'
    case 'specs':
      return index === undefined ? 'Ürün özellikleri' : `${Number(index) + 1}. özellik ${part === 'value' ? 'değeri' : 'adı'}`
    case 'seoTitle':
      return 'SEO başlığı'
    case 'seoDescription':
      return 'SEO açıklaması'
    default:
      return 'Durum'
  }
}

export function ProductFormDialog({
  projectId,
  product,
  categories,
  collections = [],
  onClose,
  onSaved,
  formRef,
}: Props) {
  const [initial] = useState(() => formFromProduct(product))
  const [initialCollectionIds] = useState(() =>
    product ? collections.filter((c) => c.product_ids.includes(product.id)).map((c) => c.id) : [],
  )
  const [collectionIds, setCollectionIds] = useState<string[]>(initialCollectionIds)
  // Drafts get a client-made id so retries of the same new product share one AI series.
  const [aiProductKey] = useState(() => product?.id ?? crypto.randomUUID())
  const [form, setForm] = useState<ProductFormState>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [general, setGeneral] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN_SECTIONS)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [imagesBusy, setImagesBusy] = useState(false)
  const [focusRequest, setFocusRequest] = useState<{ field: string; n: number } | null>(null)
  const [isPending, startTransition] = useTransition()
  const sessionUploads = useRef<Set<string>>(new Set())
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<Element | null>(null)

  const collectionsChanged =
    collectionIds.length !== initialCollectionIds.length ||
    collectionIds.some((id) => !initialCollectionIds.includes(id))
  const dirty = isFormDirty(initial, form) || collectionsChanged
  const counts = errorCountBySection(errors)
  const errorFields = sortFieldsByForm(Object.keys(errors))

  useEffect(() => {
    returnFocusTo.current = document.activeElement
    document.getElementById(fieldDomId('name'))?.focus()
    return () => {
      const target = returnFocusTo.current
      if (target instanceof HTMLElement) target.focus()
    }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (!focusRequest) return
    const el = document.getElementById(fieldDomId(focusRequest.field))
    if (!el) return
    el.scrollIntoView?.({ block: 'center' })
    el.focus({ preventScroll: true })
  }, [focusRequest])

  const clearErrors = useCallback((...fields: string[]) => {
    setErrors((current) => {
      const keys = Object.keys(current).filter((key) => fields.some((f) => key === f || key.startsWith(`${f}.`)))
      if (keys.length === 0) return current
      const next = { ...current }
      for (const key of keys) delete next[key]
      return next
    })
  }, [])

  const applyFields = useCallback(
    (fields: ProductFormFields) => {
      setForm((current) => applyProductFields(current, fields, { categoryIds: categories.map((c) => c.id) }))
      clearErrors(...fieldsTouchedBy(fields))
    },
    [categories, clearErrors],
  )
  useImperativeHandle(formRef, () => ({ applyFields }), [applyFields])

  function applyAiChange(change: AiApplyChange) {
    setForm((current) => {
      const next = { ...current }
      if (change.description !== undefined) {
        next.description = change.description
      }
      if (change.seoTitle !== undefined) {
        next.seoTitle = change.seoTitle
      }
      if (change.seoDescription !== undefined) {
        next.seoDescription = change.seoDescription
      }
      if (change.categoryId !== undefined && categories.some((c) => c.id === change.categoryId)) {
        next.categoryId = change.categoryId
      }
      if (change.specs) {
        const known = new Set(current.specs.map((s) => s.name.trim().toLocaleLowerCase('tr')))
        const added = change.specs.filter((s) => !known.has(s.name.trim().toLocaleLowerCase('tr')))
        next.specs = [...current.specs, ...added].slice(0, PRODUCT_LIMITS.specCount)
      }
      if (change.imageAlts) {
        const alts = change.imageAlts
        next.images = current.images.map((image, index) => (alts[index] ? { ...image, alt: alts[index] as string } : image))
      }
      return next
    })
    clearErrors('description', 'seoTitle', 'seoDescription', 'categoryId', 'specs', 'images')
  }

  function patch(change: Partial<ProductFormState>, ...fields: string[]) {
    setForm((current) => ({ ...current, ...change }))
    if (fields.length) clearErrors(...fields)
  }

  function showErrors(messages: FieldErrors) {
    const fields = sortFieldsByForm(Object.keys(messages))
    setErrors(messages)
    setGeneral(null)
    setOpen((current) => {
      const next = { ...current }
      for (const field of fields) next[sectionOfField(field)] = true
      return next
    })
    if (fields[0]) setFocusRequest((previous) => ({ field: fields[0], n: (previous?.n ?? 0) + 1 }))
  }

  function discardOrphans(kept: ProductFormState['images']) {
    const keptUrls = new Set(kept.map((image) => image.url))
    const orphans = Array.from(sessionUploads.current).filter((url) => !keptUrls.has(url))
    if (orphans.length > 0) void discardProductImages(projectId, orphans).catch(() => {})
  }

  function leave() {
    discardOrphans([])
    onClose()
  }

  function requestClose() {
    if (dirty) setConfirmLeave(true)
    else leave()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (isPending || imagesBusy) return

    const { input, errors: local } = validateProductForm(form)
    if (Object.keys(local).length > 0) {
      showErrors(local)
      return
    }

    setGeneral(null)
    startTransition(async () => {
      let result: SaveProductResult
      try {
        result = await saveProduct(projectId, product?.id ?? null, input)
      } catch {
        result = { ok: false, errors: [], reason: 'unexpected' }
      }

      if (result.ok) {
        discardOrphans(form.images)
        if (collections.length > 0 && collectionsChanged) {
          try {
            const synced = await setProductCollections(projectId, result.product.id, collectionIds)
            if (!synced.ok) window.alert('Ürün kaydedildi ancak koleksiyon seçimi güncellenemedi. Koleksiyonlar panelinden tekrar deneyin.')
          } catch {
            window.alert('Ürün kaydedildi ancak koleksiyon seçimi güncellenemedi. Koleksiyonlar panelinden tekrar deneyin.')
          }
        }
        onSaved(result.product, product ? 'updated' : 'created')
        return
      }
      if (result.errors.length > 0) {
        showErrors(errorsToMessages(result.errors))
        return
      }
      setGeneral(result.reason === 'limit_reached' ? LIMIT_MESSAGE : UNEXPECTED_MESSAGE)
    })
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      requestClose()
      return
    }
    trapTab(event, dialogRef.current)
  }

  const toggle = (id: SectionId) => setOpen((current) => ({ ...current, [id]: !current[id] }))
  const sectionProps = (id: SectionId) => {
    const summary = sectionSummary(id, form, categories)
    return {
      title: SECTION_TITLES[id],
      summary: summary.text,
      done: summary.done,
      errorCount: counts[id],
      open: open[id],
      onToggle: () => toggle(id),
    }
  }

  const ctl = (field: string, hasHint = false) => controlProps(fieldDomId(field), errors[field], hasHint)
  const busy = isPending || imagesBusy

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        onKeyDown={handleKeyDown}
        className="flex max-h-[94svh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="product-form-title" className="font-display text-xl font-bold">
            {product ? 'Ürünü düzenle' : 'Yeni ürün'}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Formu kapat"
            className="rounded-md p-2 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {errorFields.length > 0 && (
              <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <p className="font-medium">Kaydedilemedi: {errorFields.length} alanı düzeltin.</p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {errorFields.slice(0, 5).map((field) => (
                    <li key={field}>
                      {fieldLabel(field)}: {errors[field]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {general && (
              <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {general}
              </p>
            )}

            <ProductAiAssistant
              projectId={projectId}
              productKey={aiProductKey}
              name={form.name}
              categoryId={form.categoryId}
              categories={categories}
              specs={form.specs}
              imageUrls={form.images.map((image) => image.url)}
              disabled={busy}
              onApply={applyAiChange}
            />

            <FormSection {...sectionProps('basics')}>
              <Field id={fieldDomId('name')} label="Ürün adı" required error={errors.name}>
                <input
                  {...ctl('name')}
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value }, 'name')}
                  className={inputClass}
                />
              </Field>
              <Field id={fieldDomId('description')} label="Açıklama" error={errors.description}>
                <textarea
                  {...ctl('description')}
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value }, 'description')}
                  rows={3}
                  className={`${inputClass} h-auto resize-y py-2`}
                />
              </Field>
              {categories.length > 0 && (
                <Field id={fieldDomId('categoryId')} label="Kategori" error={errors.categoryId}>
                  <select
                    {...ctl('categoryId')}
                    value={form.categoryId}
                    onChange={(e) => patch({ categoryId: e.target.value }, 'categoryId')}
                    className={inputClass}
                  >
                    <option value="">Kategorisiz</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {collections.length > 0 && (
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="mb-1.5 font-medium">Koleksiyonlar</legend>
                  <div className="flex flex-wrap gap-2">
                    {collections.map((collection) => {
                      const checked = collectionIds.includes(collection.id)
                      return (
                        <label
                          key={collection.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            checked ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="size-3.5"
                            checked={checked}
                            onChange={() =>
                              setCollectionIds((current) =>
                                checked ? current.filter((id) => id !== collection.id) : [...current, collection.id],
                              )
                            }
                          />
                          {collection.name}
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
              )}
            </FormSection>

            <FormSection {...sectionProps('images')}>
              <div id={fieldDomId('images')} tabIndex={-1} className="outline-none">
                <ProductImageEditor
                  projectId={projectId}
                  productName={form.name}
                  images={form.images}
                  onChange={(images) => patch({ images }, 'images')}
                  onUploaded={(url) => sessionUploads.current.add(url)}
                  onBusyChange={setImagesBusy}
                />
                <ProductAiImageAssistant
                  projectId={projectId}
                  productKey={aiProductKey}
                  name={form.name}
                  images={form.images}
                  disabled={busy || imagesBusy}
                  onAdd={(image) => {
                    sessionUploads.current.add(image.url)
                    setForm((current) => ({ ...current, images: [...current.images, image] }))
                    clearErrors('images')
                  }}
                />
                {errors.images && (
                  <p id={`${fieldDomId('images')}-error`} className="mt-2 text-xs font-medium text-destructive">
                    {errors.images}
                  </p>
                )}
              </div>
            </FormSection>

            <FormSection {...sectionProps('pricing')}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id={fieldDomId('price')} label="Satış fiyatı (₺)" required error={errors.price}>
                  <input
                    {...ctl('price')}
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.price}
                    onChange={(e) => patch({ price: e.target.value }, 'price', 'compareAtPrice')}
                    className={inputClass}
                  />
                </Field>
                <Field
                  id={fieldDomId('compareAtPrice')}
                  label="Eski fiyat (₺)"
                  hint="Satış fiyatından yüksekse indirim rozeti gösterilir."
                  error={errors.compareAtPrice}
                >
                  <input
                    {...ctl('compareAtPrice', true)}
                    type="text"
                    inputMode="decimal"
                    placeholder="İsteğe bağlı"
                    value={form.compareAtPrice}
                    onChange={(e) => patch({ compareAtPrice: e.target.value }, 'compareAtPrice')}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field
                id={fieldDomId('vatRate')}
                label="KDV oranı"
                hint="Fiyatlar KDV dahildir; sitede “KDV dahil” yazar."
                error={errors.vatRate}
              >
                <select
                  {...ctl('vatRate', true)}
                  value={form.vatRate}
                  onChange={(e) => patch({ vatRate: e.target.value as ProductFormState['vatRate'] }, 'vatRate')}
                  className={inputClass}
                >
                  <option value="0">%0</option>
                  <option value="1">%1</option>
                  <option value="10">%10</option>
                  <option value="20">%20</option>
                </select>
              </Field>
            </FormSection>

            <FormSection {...sectionProps('stock')}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.trackStock}
                  onChange={(e) => patch({ trackStock: e.target.checked }, 'stock')}
                  className="mt-0.5 size-4"
                />
                <span>
                  Stok takibi yap
                  <span className="block text-xs text-muted-foreground">
                    Açıkken stok adedi düşer ve tükenince satış durur. Kapalıyken ürün her zaman satın alınabilir.
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id={fieldDomId('stock')} label="Stok adedi" error={errors.stock}>
                  <input
                    {...ctl('stock')}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    disabled={!form.trackStock}
                    placeholder={form.trackStock ? undefined : 'Takip yok'}
                    value={form.trackStock ? form.stock : ''}
                    onChange={(e) => patch({ stock: e.target.value }, 'stock')}
                    className={inputClass}
                  />
                </Field>
                <Field id={fieldDomId('sku')} label="Stok kodu (SKU)">
                  <input
                    id={fieldDomId('sku')}
                    value={form.sku}
                    onChange={(e) => patch({ sku: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field id={fieldDomId('shippingNote')} label="Hazırlık / kargo süresi" error={errors.shippingNote}>
                <input
                  {...ctl('shippingNote')}
                  value={form.shippingNote}
                  placeholder="1-3 iş günü"
                  onChange={(e) => patch({ shippingNote: e.target.value }, 'shippingNote')}
                  className={inputClass}
                />
              </Field>
            </FormSection>

            <FormSection {...sectionProps('specs')}>
              <p className="text-xs text-muted-foreground">
                Değeri boş bıraktığınız özellik, ürün sayfasında “✓ özellik adı” etiketi olarak görünür (ör. “Su geçirmez”).
              </p>
              {errors.specs && <p className="text-xs font-medium text-destructive">{errors.specs}</p>}
              {form.specs.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="hidden grid-cols-[1fr_1fr_2.5rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
                    <span>Özellik adı</span>
                    <span>Değeri (isteğe bağlı)</span>
                    <span />
                  </div>
                  {form.specs.map((spec, index) => {
                    const nameField = `specs.${index}.name`
                    const valueField = `specs.${index}.value`
                    return (
                      <div key={index} className="grid grid-cols-[1fr_2.5rem] gap-2 sm:grid-cols-[1fr_1fr_2.5rem]">
                        <div className="flex flex-col gap-1">
                          <input
                            {...ctl(nameField)}
                            aria-label={`${index + 1}. özellik adı`}
                            value={spec.name}
                            placeholder="Özellik adı"
                            maxLength={PRODUCT_LIMITS.specName}
                            onChange={(e) =>
                              patch(
                                { specs: form.specs.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)) },
                                nameField,
                                'specs',
                              )
                            }
                            className={inputClass}
                          />
                          {errors[nameField] && (
                            <p id={`${fieldDomId(nameField)}-error`} className="text-xs font-medium text-destructive">
                              {errors[nameField]}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => patch({ specs: form.specs.filter((_, i) => i !== index) }, 'specs')}
                          aria-label={`${index + 1}. özelliği sil`}
                          className="order-last flex size-10 items-center justify-center self-start rounded-md text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/60 sm:order-none"
                        >
                          <Trash2 className="size-4" />
                        </button>
                        <div className="col-span-2 flex flex-col gap-1 sm:order-[-1] sm:col-span-1 sm:col-start-2 sm:row-start-1">
                          <input
                            {...ctl(valueField)}
                            aria-label={`${index + 1}. özellik değeri`}
                            value={spec.value}
                            placeholder="Boş bırakılabilir"
                            maxLength={PRODUCT_LIMITS.specValue}
                            onChange={(e) =>
                              patch(
                                { specs: form.specs.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)) },
                                valueField,
                                'specs',
                              )
                            }
                            className={inputClass}
                          />
                          {errors[valueField] && (
                            <p id={`${fieldDomId(valueField)}-error`} className="text-xs font-medium text-destructive">
                              {errors[valueField]}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <button
                type="button"
                disabled={form.specs.length >= PRODUCT_LIMITS.specCount}
                onClick={() => patch({ specs: [...form.specs, { name: '', value: '' }] })}
                className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-md border border-dashed border-border px-3 text-sm font-medium outline-none transition-colors hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
              >
                <Plus className="size-4" />
                Özellik ekle
              </button>
            </FormSection>

            <FormSection {...sectionProps('publish')}>
              <Field id={fieldDomId('status')} label="Durum">
                <select
                  id={fieldDomId('status')}
                  value={form.status}
                  onChange={(e) => patch({ status: e.target.value as ProductStatus })}
                  className={inputClass}
                >
                  <option value="active">Aktif</option>
                  <option value="draft">Taslak</option>
                  <option value="archived">Arşiv</option>
                </select>
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.showOnHome}
                  onChange={(e) => patch({ showOnHome: e.target.checked })}
                  className="mt-0.5 size-4"
                />
                <span>
                  Ana sayfada göster
                  <span className="block text-xs text-muted-foreground">
                    Vitrin &quot;Elle seçtiklerim&quot; modundayken bu ürün ana sayfada görünür.
                  </span>
                </span>
              </label>
              <Field
                id={fieldDomId('seoTitle')}
                label="SEO başlığı"
                hint={`Arama sonuçlarında görünen başlık. ${form.seoTitle.length}/${PRODUCT_LIMITS.seoTitle}`}
                error={errors.seoTitle}
              >
                <input
                  {...ctl('seoTitle', true)}
                  value={form.seoTitle}
                  maxLength={PRODUCT_LIMITS.seoTitle}
                  placeholder="Boşsa ürün adı kullanılır"
                  onChange={(e) => patch({ seoTitle: e.target.value }, 'seoTitle')}
                  className={inputClass}
                />
              </Field>
              <Field
                id={fieldDomId('seoDescription')}
                label="SEO açıklaması"
                hint={`Arama sonuçlarında başlığın altındaki kısa metin. ${form.seoDescription.length}/${PRODUCT_LIMITS.seoDescription}`}
                error={errors.seoDescription}
              >
                <textarea
                  {...ctl('seoDescription', true)}
                  value={form.seoDescription}
                  rows={3}
                  maxLength={PRODUCT_LIMITS.seoDescription}
                  placeholder="Boşsa ürün açıklaması kullanılır"
                  onChange={(e) => patch({ seoDescription: e.target.value }, 'seoDescription')}
                  className={`${inputClass} h-auto resize-y py-2`}
                />
              </Field>
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Ürün adresi</span>
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {product?.slug ?? 'Ürün adından otomatik oluşturulur.'}
                </p>
              </div>
            </FormSection>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-5 py-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={requestClose}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {isPending ? 'Kaydediliyor...' : imagesBusy ? 'Görseller yükleniyor…' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>

      {confirmLeave && (
        <ConfirmDialog
          title="Kaydedilmemiş değişiklikler var"
          description="Formdan çıkarsanız yaptığınız değişiklikler kaybolur."
          onDismiss={() => setConfirmLeave(false)}
        >
          <button
            type="button"
            onClick={leave}
            className="inline-flex h-10 items-center justify-center rounded-md border border-destructive/50 px-4 text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/50"
          >
            Çık
          </button>
          <button
            type="button"
            data-autofocus
            onClick={() => setConfirmLeave(false)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            Düzenlemeye devam et
          </button>
        </ConfirmDialog>
      )}
    </div>
  )
}
