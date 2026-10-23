'use client'

import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, Lock, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import {
  PRODUCT_CATEGORY_MAX,
  PRODUCT_CATEGORY_NAME_MAX,
  OTHER_CATEGORY,
  addCategory,
  categoryProductCount,
  effectiveCategories,
  isOtherCategory,
  renameCategory,
  type CategoryError,
} from '@/lib/product-categories'
import { IconBtn } from '@/components/editor/editor-fields'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type ProductsData = Extract<Section, { type: 'products' }>

const COPY = {
  tr: {
    heading: 'Kategoriler',
    hint: 'Ürünleri kategorilere ayırın. Kategori adı değişince sayfa adresi de değişir; eski adres yeni adrese yönlenir.',
    placeholder: 'Yeni kategori adı',
    add: 'Ekle',
    rename: 'Adı değiştir',
    save: 'Kaydet',
    cancel: 'Vazgeç',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Kategoriyi sil',
    other: 'Kategorisiz ürünler burada görünür. Silinemez ve adı değiştirilemez.',
    products: (n: number) => `${n} ürün`,
    deleteTitle: (name: string) => `"${name}" kategorisi silinsin mi?`,
    deleteBody: (n: number) =>
      n > 0
        ? `Bu kategorideki ${n} ürün silinmez; "${OTHER_CATEGORY}" kategorisine taşınır.`
        : 'Bu kategoride ürün yok. Yalnızca kategori silinir.',
    confirmDelete: 'Evet, sil',
    errors: {
      empty: 'Kategori adı boş olamaz.',
      duplicate: 'Bu adla bir kategori zaten var.',
      reserved: `"${OTHER_CATEGORY}" ayrılmış bir addır.`,
      full: `En fazla ${PRODUCT_CATEGORY_MAX} kategori ekleyebilirsiniz.`,
      missing: 'Kategori bulunamadı.',
    } satisfies Record<CategoryError, string>,
  },
  en: {
    heading: 'Categories',
    hint: 'Group products into categories. Renaming a category changes its page address; the old address redirects to the new one.',
    placeholder: 'New category name',
    add: 'Add',
    rename: 'Rename',
    save: 'Save',
    cancel: 'Cancel',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete category',
    other: 'Products without a category appear here. It cannot be renamed or deleted.',
    products: (n: number) => `${n} ${n === 1 ? 'product' : 'products'}`,
    deleteTitle: (name: string) => `Delete the "${name}" category?`,
    deleteBody: (n: number) =>
      n > 0
        ? `The ${n} ${n === 1 ? 'product' : 'products'} in this category will not be deleted; they move to "${OTHER_CATEGORY}".`
        : 'This category has no products. Only the category is removed.',
    confirmDelete: 'Yes, delete',
    errors: {
      empty: 'The category name cannot be empty.',
      duplicate: 'A category with this name already exists.',
      reserved: `"${OTHER_CATEGORY}" is a reserved name.`,
      full: `You can add up to ${PRODUCT_CATEGORY_MAX} categories.`,
      missing: 'Category not found.',
    } satisfies Record<CategoryError, string>,
  },
} as const

const INPUT_CLASS =
  'h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

export function ProductCategoriesBlock({
  lang,
  index,
  section,
  onDispatch,
}: {
  lang: 'tr' | 'en'
  index: number
  section: ProductsData
  onDispatch: (op: EditOperation) => void
}) {
  const c = COPY[lang]
  const names = effectiveCategories(section).filter((name) => !isOtherCategory(name))
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ from: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const submitAdd = () => {
    const result = addCategory(section, draft)
    if (!result.ok) return setError(c.errors[result.error])
    onDispatch({ op: 'addProductCategory', index, name: draft })
    setDraft('')
    setError(null)
  }

  const submitRename = () => {
    if (!editing) return
    const result = renameCategory(section, editing.from, editing.value)
    if (!result.ok) return setError(c.errors[result.error])
    onDispatch({ op: 'renameProductCategory', index, from: editing.from, name: editing.value })
    setEditing(null)
    setError(null)
  }

  const confirmDelete = () => {
    if (pendingDelete) onDispatch({ op: 'removeProductCategory', index, name: pendingDelete })
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <span className="text-xs font-medium text-muted-foreground">{c.heading}</span>
      <p className="text-[11px] leading-snug text-muted-foreground/80">{c.hint}</p>

      <ul className="flex flex-col gap-1">
        {names.map((name, i) => {
          const isEditing = editing?.from === name
          return (
            <li key={name} className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
              {isEditing ? (
                <>
                  <input
                    autoFocus
                    aria-label={c.rename}
                    className={INPUT_CLASS}
                    value={editing.value}
                    maxLength={PRODUCT_CATEGORY_NAME_MAX}
                    onChange={(e) => setEditing({ from: name, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        submitRename()
                      }
                      if (e.key === 'Escape') {
                        e.stopPropagation()
                        setEditing(null)
                        setError(null)
                      }
                    }}
                  />
                  <IconBtn label={c.save} small onClick={submitRename}>
                    <Check className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    label={c.cancel}
                    small
                    onClick={() => {
                      setEditing(null)
                      setError(null)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconBtn>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{c.products(categoryProductCount(section, name))}</span>
                  <IconBtn label={c.up} small disabled={i === 0} onClick={() => onDispatch({ op: 'moveProductCategory', index, name, direction: -1 })}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    label={c.down}
                    small
                    disabled={i === names.length - 1}
                    onClick={() => onDispatch({ op: 'moveProductCategory', index, name, direction: 1 })}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn
                    label={c.rename}
                    small
                    onClick={() => {
                      setEditing({ from: name, value: name })
                      setError(null)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconBtn>
                  <IconBtn label={c.remove} small onClick={() => setPendingDelete(name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </>
              )}
            </li>
          )
        })}

        <li className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm">{OTHER_CATEGORY}</span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{c.products(categoryProductCount(section, OTHER_CATEGORY))}</span>
        </li>
      </ul>
      <p className="text-[11px] leading-snug text-muted-foreground/80">{c.other}</p>

      <div className="flex items-center gap-2">
        <input
          aria-label={c.placeholder}
          className={INPUT_CLASS}
          placeholder={c.placeholder}
          value={draft}
          maxLength={PRODUCT_CATEGORY_NAME_MAX}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
        />
        <button
          type="button"
          onClick={submitAdd}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium transition-colors hover:border-brand hover:text-brand"
        >
          <Plus className="h-3.5 w-3.5" />
          {c.add}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={c.deleteTitle(pendingDelete ?? '')}
        description={c.deleteBody(pendingDelete ? categoryProductCount(section, pendingDelete) : 0)}
        confirmLabel={c.confirmDelete}
        cancelLabel={c.cancel}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
