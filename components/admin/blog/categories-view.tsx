'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLanguage } from '@/components/language-provider'
import { DataTable, PageHeader, Panel, Td, Th, Tr } from '@/components/admin/admin-ui'
import { blogAdminT } from '@/lib/blog-admin-copy'
import { deleteCategoryAction, saveCategoryAction } from '@/app/admin/blog/actions'
import { LIMITS, slugifyBlog, type FieldErrors } from '@/lib/blog-admin-shared'
import type { AdminCategory } from '@/lib/blog-admin'

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50 aria-[invalid=true]:border-destructive'

type Draft = { id?: string; name: string; slug: string; description: string; sortOrder: string }
const blank = (order: number): Draft => ({ name: '', slug: '', description: '', sortOrder: String(order) })

export function CategoriesView({ categories }: { categories: AdminCategory[] }) {
  const { lang } = useLanguage()
  const t = blogAdminT(lang)
  const c = t.categories
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState('')
  const [toDelete, setToDelete] = useState<AdminCategory | null>(null)
  const [pending, startTransition] = useTransition()

  const open = (next: Draft, touched: boolean) => {
    setDraft(next)
    setSlugTouched(touched)
    setErrors({})
    setMessage('')
  }

  const err = (key: string) => (errors[key] ? (t.errors[errors[key] as string] ?? t.errors.invalid) : undefined)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft) return
    startTransition(async () => {
      const result = await saveCategoryAction({
        id: draft.id,
        name: draft.name,
        slug: draft.slug,
        description: draft.description,
        sortOrder: Number(draft.sortOrder) || 0,
      })
      if (!result.ok) {
        setErrors(result.errors ?? {})
        setMessage(t.errors[result.error] ?? t.errors.failed)
        return
      }
      setDraft(null)
      router.refresh()
    })
  }

  const remove = (category: AdminCategory) => {
    startTransition(async () => {
      const result = await deleteCategoryAction(category.id)
      if (!result.ok) setMessage(t.errors[result.error] ?? t.errors.failed)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/blog" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {c.back}
      </Link>
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        action={
          <Button type="button" size="lg" onClick={() => open(blank(categories.length), false)}>
            <Plus aria-hidden />
            {c.add}
          </Button>
        }
      />

      {message && !draft ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {message}
        </p>
      ) : null}

      {draft ? (
        <Panel title={draft.id ? c.edit : c.newTitle}>
          <form onSubmit={submit} className="grid gap-4 p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {c.name}
              <input
                required
                autoFocus
                maxLength={LIMITS.categoryName}
                value={draft.name}
                aria-invalid={Boolean(errors.name)}
                onChange={(ev) => {
                  const name = ev.target.value
                  setDraft((d) => (d ? { ...d, name, slug: slugTouched ? d.slug : slugifyBlog(name, LIMITS.categorySlug) } : d))
                }}
                className={field}
              />
              {err('name') ? <span role="alert" className="text-xs font-normal text-destructive">{err('name')}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {c.slug}
              <input
                required
                maxLength={LIMITS.categorySlug}
                value={draft.slug}
                aria-invalid={Boolean(errors.slug)}
                onChange={(ev) => {
                  setSlugTouched(true)
                  setDraft((d) => (d ? { ...d, slug: slugifyBlog(ev.target.value, LIMITS.categorySlug) } : d))
                }}
                className={`${field} font-mono`}
              />
              {err('slug') ? <span role="alert" className="text-xs font-normal text-destructive">{err('slug')}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
              {c.description}
              <textarea
                rows={2}
                maxLength={LIMITS.categoryDescription}
                value={draft.description}
                onChange={(ev) => setDraft((d) => (d ? { ...d, description: ev.target.value } : d))}
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {c.order}
              <input
                type="number"
                min={0}
                max={999}
                value={draft.sortOrder}
                onChange={(ev) => setDraft((d) => (d ? { ...d, sortOrder: ev.target.value } : d))}
                className={`${field} w-28`}
              />
            </label>
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              {message ? <p role="alert" className="mr-auto text-xs text-destructive">{message}</p> : null}
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                {c.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {c.save}
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <DataTable
        isEmpty={categories.length === 0}
        empty={c.empty}
        head={
          <>
            <Th>{c.name}</Th>
            <Th>{c.slug}</Th>
            <Th>{c.order}</Th>
            <Th>{t.list.title}</Th>
            <Th className="text-right">{t.list.cols.actions}</Th>
          </>
        }
      >
        {categories.map((category) => (
          <Tr key={category.id}>
            <Td>
              <p className="font-medium text-foreground">{category.name}</p>
              {category.description ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{category.description}</p> : null}
            </Td>
            <Td className="font-mono text-xs text-muted-foreground">{category.slug}</Td>
            <Td className="tabular-nums text-muted-foreground">{category.sortOrder}</Td>
            <Td className="tabular-nums text-muted-foreground">
              {category.postCount} {c.posts}
            </Td>
            <Td>
              <div className="flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${c.edit}: ${category.name}`}
                  title={c.edit}
                  onClick={() =>
                    open(
                      { id: category.id, name: category.name, slug: category.slug, description: category.description ?? '', sortOrder: String(category.sortOrder) },
                      true,
                    )
                  }
                >
                  <Pencil aria-hidden />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`${c.delete}: ${category.name}`} title={c.delete} disabled={pending} onClick={() => setToDelete(category)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={toDelete !== null}
        title={c.deleteTitle}
        description={toDelete ? c.deleteBody(toDelete.postCount) : ''}
        confirmLabel={c.delete}
        cancelLabel={c.cancel}
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const target = toDelete
          setToDelete(null)
          if (target) remove(target)
        }}
      />
    </div>
  )
}
