'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ExternalLink, Pencil, Plus, Star, Tags, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLanguage } from '@/components/language-provider'
import { DataTable, PageHeader, StatusBadge, Td, Th, Tr, type MailStatusTone } from '@/components/admin/admin-ui'
import { blogAdminT } from '@/lib/blog-admin-copy'
import { deletePostAction, setPostStatusAction } from '@/app/admin/blog/actions'
import type { AdminCategory, AdminPostSummary } from '@/lib/blog-admin'
import { cn } from '@/lib/utils'

type Tab = 'all' | 'live' | 'scheduled' | 'draft'
const TONE: Record<AdminPostSummary['visibility'], MailStatusTone> = { live: 'success', scheduled: 'warning', draft: 'muted' }

const formatDate = (iso: string | null, lang: string) =>
  iso
    ? new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : '—'

export function PostsView({ posts, categories }: { posts: AdminPostSummary[]; categories: AdminCategory[] }) {
  const { lang } = useLanguage()
  const t = blogAdminT(lang)
  const l = t.list
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [toDelete, setToDelete] = useState<AdminPostSummary | null>(null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const counts = useMemo(
    () => ({
      all: posts.length,
      live: posts.filter((p) => p.visibility === 'live').length,
      scheduled: posts.filter((p) => p.visibility === 'scheduled').length,
      draft: posts.filter((p) => p.visibility === 'draft').length,
    }),
    [posts],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en')
    return posts.filter((p) => {
      if (tab !== 'all' && p.visibility !== tab) return false
      if (category && p.categoryName !== category) return false
      if (!q) return true
      return `${p.title} ${p.slug}`.toLocaleLowerCase(lang === 'tr' ? 'tr' : 'en').includes(q)
    })
  }, [posts, tab, query, category, lang])

  const run = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError('')
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(t.errors[result.error ?? 'failed'] ?? t.errors.failed)
      router.refresh()
    })
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: l.tabs.all },
    { id: 'live', label: l.tabs.live },
    { id: 'scheduled', label: l.tabs.scheduled },
    { id: 'draft', label: l.tabs.draft },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={l.title}
        subtitle={l.subtitle}
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin/blog/categories" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              <Tags aria-hidden />
              {l.categories}
            </Link>
            <Link href="/admin/blog/new" className={cn(buttonVariants({ size: 'lg' }))}>
              <Plus aria-hidden />
              {l.newPost}
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={l.title} className="inline-flex flex-wrap rounded-lg border border-border bg-card/70 p-0.5 text-sm">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${tab === item.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {item.label}
              <span className="text-xs tabular-nums text-muted-foreground">{counts[item.id]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
            placeholder={l.search}
            aria-label={l.search}
            className="h-9 w-56 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/50"
          />
          <select
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
            aria-label={l.allCategories}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <option value="">{l.allCategories}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DataTable
        isEmpty={filtered.length === 0}
        empty={posts.length === 0 ? l.empty : l.noResults}
        head={
          <>
            <Th>{l.cols.title}</Th>
            <Th>{l.cols.category}</Th>
            <Th>{l.cols.status}</Th>
            <Th>{l.cols.date}</Th>
            <Th className="text-right">{l.cols.actions}</Th>
          </>
        }
      >
        {filtered.map((post) => (
          <Tr key={post.id}>
            <Td className="max-w-md">
              <Link href={`/admin/blog/${post.id}`} className="flex items-center gap-3">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                  {post.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.coverUrl} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span className="line-clamp-1 font-medium text-foreground hover:underline">{post.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="truncate font-mono">/blog/{post.slug}</span>
                    <span>
                      {post.readingTime} {l.readingTime}
                    </span>
                    {post.hasEnglish ? <span className="font-medium">{l.english}</span> : null}
                    {post.featured ? (
                      <span className="inline-flex items-center gap-1 text-foreground">
                        <Star className="size-3" aria-hidden />
                        {l.featured}
                      </span>
                    ) : null}
                    {post.noindex ? <span>{l.noindex}</span> : null}
                  </span>
                </span>
              </Link>
            </Td>
            <Td className="text-muted-foreground">{post.categoryName ?? l.uncategorized}</Td>
            <Td>
              <StatusBadge tone={TONE[post.visibility]} label={t.status[post.visibility]} />
            </Td>
            <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(post.publishedAt ?? post.updatedAt, lang)}</Td>
            <Td>
              <div className="flex items-center justify-end gap-1">
                {post.visibility === 'live' ? (
                  <Link href={`/blog/${post.slug}`} target="_blank" aria-label={`${l.view}: ${post.title}`} title={l.view} className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
                    <ExternalLink aria-hidden />
                  </Link>
                ) : null}
                <Link href={`/admin/blog/${post.id}`} aria-label={`${l.edit}: ${post.title}`} title={l.edit} className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}>
                  <Pencil aria-hidden />
                </Link>
                {post.visibility !== 'scheduled' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => setPostStatusAction(post.id, post.visibility === 'live' ? 'draft' : 'published'))}
                  >
                    {post.visibility === 'live' ? l.unpublish : l.publish}
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="icon" aria-label={`${l.delete}: ${post.title}`} title={l.delete} disabled={pending} onClick={() => setToDelete(post)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>

      <ConfirmDialog
        open={toDelete !== null}
        title={l.deleteTitle}
        description={l.deleteBody}
        confirmLabel={l.delete}
        cancelLabel={l.cancel}
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const target = toDelete
          setToDelete(null)
          if (target) run(() => deletePostAction(target.id))
        }}
      />
    </div>
  )
}
