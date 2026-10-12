'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ProductRow } from '@/lib/ecommerce'
import {
  createCollection,
  deleteCollection,
  renameCollection,
  reorderCollections,
  setCollectionAutoBestSellers,
  setCollectionProducts,
} from '@/lib/store-collections-actions'
import {
  COLLECTION_NAME_MAX,
  MAX_COLLECTIONS,
  type CollectionResult,
  type OwnerCollection,
} from '@/lib/store-collections-core'
import { foldText } from '@/lib/store-discovery'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, inputClass } from './form-parts'

type Props = {
  projectId: string
  collections: OwnerCollection[]
  products: ProductRow[]
  available: boolean
}

type Dialog =
  | { kind: 'rename'; collection: OwnerCollection }
  | { kind: 'products'; collection: OwnerCollection }
  | { kind: 'delete'; collection: OwnerCollection }
  | null

const GENERIC_ERROR = 'İşlem tamamlanamadı. Lütfen tekrar dene.'

function firstError(result: CollectionResult<object>): string {
  return result.ok ? '' : (result.errors[0]?.message ?? GENERIC_ERROR)
}

export function CollectionsPanel({ projectId, collections, products, available }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [isPending, startTransition] = useTransition()

  const productNames = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products])

  function run(action: () => Promise<CollectionResult<object>>, onOk?: () => void) {
    setNotice('')
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) return setNotice(firstError(result))
        onOk?.()
        router.refresh()
      } catch {
        setNotice(GENERIC_ERROR)
      }
    })
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    setNameError('')
    setNotice('')
    startTransition(async () => {
      try {
        const result = await createCollection(projectId, name)
        if (!result.ok) {
          const message = firstError(result)
          return result.errors[0]?.field === 'name' ? setNameError(message) : setNotice(message)
        }
        setName('')
        router.refresh()
      } catch {
        setNotice(GENERIC_ERROR)
      }
    })
  }

  function move(index: number, delta: -1 | 1) {
    const ids = collections.map((c) => c.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    run(() => reorderCollections(projectId, ids))
  }

  if (!available) {
    return (
      <section className="mt-8 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        Koleksiyonlar henüz etkinleştirilmedi. Veritabanı güncellemesi uygulandığında bu bölüm açılır.
      </section>
    )
  }

  const atLimit = collections.length >= MAX_COLLECTIONS

  return (
    <section className="mt-8" aria-labelledby="collections-title">
      <h2 id="collections-title" className="font-display text-xl font-bold">
        Koleksiyonlar
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ürünleri gruplayın; mağazada ve ana sayfa ürün bölümlerinde gösterin. Koleksiyon silmek ürünleri silmez.
        ({collections.length}/{MAX_COLLECTIONS})
      </p>

      <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="collection-name" className="text-sm font-medium">
          Yeni koleksiyon adı
        </label>
        <div className="flex gap-2">
          <input
            id="collection-name"
            value={name}
            maxLength={COLLECTION_NAME_MAX}
            disabled={atLimit || isPending}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'collection-name-error' : undefined}
            placeholder="Örn. Yaz Sezonu"
            className={inputClass}
          />
          <Button type="submit" disabled={atLimit || isPending || !name.trim()} className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Ekle
          </Button>
        </div>
        {nameError && (
          <p id="collection-name-error" className="text-xs font-medium text-destructive">
            {nameError}
          </p>
        )}
        {atLimit && (
          <p className="text-xs text-muted-foreground">
            En fazla {MAX_COLLECTIONS} koleksiyon oluşturabilirsiniz.
          </p>
        )}
      </form>

      {notice && (
        <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {notice}
        </p>
      )}

      {collections.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Henüz koleksiyon yok.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {collections.map((collection, index) => (
            <li
              key={collection.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/70 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{collection.name}</p>
                <p className="text-xs text-muted-foreground">
                  {collection.auto_best_sellers ? 'Otomatik: en çok satan 8 ürün' : `${collection.product_ids.length} ürün`}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={collection.auto_best_sellers}
                  disabled={isPending}
                  onChange={(e) =>
                    run(() => setCollectionAutoBestSellers(projectId, collection.id, e.target.checked))
                  }
                />
                Otomatik: en çok satan 8 ürün
              </label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${collection.name} yukarı taşı`}
                  disabled={isPending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${collection.name} aşağı taşı`}
                  disabled={isPending || index === collections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: 'products', collection })}>
                  Ürünler
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${collection.name} yeniden adlandır`}
                  onClick={() => setDialog({ kind: 'rename', collection })}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${collection.name} sil`}
                  onClick={() => setDialog({ kind: 'delete', collection })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === 'rename' && (
        <RenameDialog
          key={dialog.collection.id}
          collection={dialog.collection}
          onClose={() => setDialog(null)}
          onSubmit={(value) => renameCollection(projectId, dialog.collection.id, value)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}

      {dialog?.kind === 'products' && (
        <ProductsDialog
          key={dialog.collection.id}
          collection={dialog.collection}
          products={products}
          onClose={() => setDialog(null)}
          onSubmit={(ids) => setCollectionProducts(projectId, dialog.collection.id, ids)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`“${dialog.collection.name}” koleksiyonu silinsin mi?`}
          description={
            <p>
              Koleksiyon kaldırılır; içindeki {dialog.collection.product_ids.length} ürün mağazada ve
              ürün listesinde kalır.
            </p>
          }
          onDismiss={() => setDialog(null)}
        >
          <Button variant="ghost" onClick={() => setDialog(null)} disabled={isPending}>
            Vazgeç
          </Button>
          <Button
            data-autofocus
            variant="destructive"
            disabled={isPending}
            onClick={() => run(() => deleteCollection(projectId, dialog.collection.id), () => setDialog(null))}
          >
            Sil
          </Button>
        </ConfirmDialog>
      )}

      <span className="sr-only" aria-live="polite">
        {productNames.size} ürün
      </span>
    </section>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85svh] w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xl"
      >
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function RenameDialog({
  collection,
  onClose,
  onSubmit,
  onDone,
}: {
  collection: OwnerCollection
  onClose: () => void
  onSubmit: (name: string) => Promise<CollectionResult<object>>
  onDone: () => void
}) {
  const [value, setValue] = useState(collection.name)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const result = await onSubmit(value)
        if (result.ok) onDone()
        else setError(firstError(result))
      } catch {
        setError(GENERIC_ERROR)
      }
    })
  }

  return (
    <ModalShell title="Koleksiyonu yeniden adlandır" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label htmlFor="rename-collection" className="text-sm font-medium">
          Koleksiyon adı
        </label>
        <input
          id="rename-collection"
          autoFocus
          value={value}
          maxLength={COLLECTION_NAME_MAX}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'rename-collection-error' : undefined}
          className={inputClass}
        />
        {error && (
          <p id="rename-collection-error" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isPending || !value.trim()}>
            Kaydet
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

function ProductsDialog({
  collection,
  products,
  onClose,
  onSubmit,
  onDone,
}: {
  collection: OwnerCollection
  products: ProductRow[]
  onClose: () => void
  onSubmit: (ids: string[]) => Promise<CollectionResult<object>>
  onDone: () => void
}) {
  const [selected, setSelected] = useState(() => new Set(collection.product_ids))
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const shown = useMemo(() => {
    const tokens = foldText(query).split(' ').filter(Boolean)
    return products.filter((p) => tokens.every((t) => foldText(p.name).includes(t)))
  }, [products, query])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function save() {
    setError('')
    startTransition(async () => {
      try {
        const result = await onSubmit([...selected])
        if (result.ok) onDone()
        else setError(firstError(result))
      } catch {
        setError(GENERIC_ERROR)
      }
    })
  }

  return (
    <ModalShell title={`“${collection.name}” ürünleri`} onClose={onClose}>
      <input
        type="search"
        aria-label="Ürün ara"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ürün ara"
        className={inputClass}
      />
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
        {shown.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Ürün bulunamadı.</li>}
        {shown.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="truncate">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{selected.size} ürün seçili</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button type="button" onClick={save} disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Kaydet
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
