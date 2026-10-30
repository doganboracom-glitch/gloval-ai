'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, Package, Pencil, Sparkles } from 'lucide-react'
import { CursorAuraDialog } from '@/components/admin/cursor-aura-dialog'
import { previewSiteTypeChange, setSiteType, type SiteTypeImpact } from '@/lib/admin/actions'
import { MAX_TYPE_CHANGE_NOTE, MIN_TYPE_CHANGE_NOTE, siteKindOf, type SelectableSiteKind, type SiteKind } from '@/lib/site-kind'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { tenantUrl } from '@/lib/domains'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge } from '@/components/admin/admin-ui'
import type { AdminSite } from '@/lib/admin/queries'

type Filter = 'all' | 'published' | 'draft'

export function SitesView({ sites }: { sites: AdminSite[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const [change, setChange] = useState<{ site: AdminSite; impact: SiteTypeImpact | null; error: string | null } | null>(null)
  const [note, setNote] = useState('')
  const [auraSite, setAuraSite] = useState<{ id: string; name: string } | null>(null)

  const kindLabel: Record<SiteKind, string> = {
    corporate: t.sites.corporate,
    ecommerce: t.sites.ecommerce,
    catalog: t.sites.catalog,
  }

  function errorText(code: string): string {
    if (code === 'has_store_data') return t.sites.typeChangeHasData
    if (code === 'has_orders') return t.sites.typeChangeHasOrders
    if (code === 'note_required') return t.sites.typeChangeNoteRequired
    if (code === 'audit_failed') return t.sites.typeChangeAuditFailed
    return t.sites.typeChangeFailed
  }

  function openChange(site: AdminSite, next: SelectableSiteKind) {
    setNote('')
    setChange({ site, impact: null, error: null })
    startTransition(async () => {
      const res = await previewSiteTypeChange(site.id, next)
      setChange({ site, impact: res.ok ? res.impact : null, error: res.ok ? null : errorText(res.error) })
    })
  }

  function closeChange() {
    setChange(null)
    router.refresh()
  }

  function confirmChange() {
    if (!change?.impact) return
    const { site, impact } = change
    startTransition(async () => {
      const res = await setSiteType(site.id, impact.to, note)
      if (!res.ok) {
        setChange({ site, impact, error: errorText(res.error) })
        return
      }
      setChange(null)
      router.refresh()
    })
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sites.filter((s) => {
      if (filter === 'published' && !s.published) return false
      if (filter === 'draft' && s.published) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.ownerEmail ?? '').toLowerCase().includes(q) ||
        (s.slug ?? '').toLowerCase().includes(q)
      )
    })
  }, [sites, query, filter])

  const filters: Filter[] = ['all', 'published', 'draft']

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.sites.title} subtitle={t.sites.subtitle} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.common.search}
          aria-label={t.common.search}
          className="h-9 w-full max-w-xs rounded-lg border border-border bg-card/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        />
        <div className="flex gap-1 rounded-lg border border-border bg-card/70 p-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                'rounded-md px-3 py-1 text-xs font-medium transition-colors ' +
                (filter === f
                  ? 'bg-brand/15 text-brand'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              {f === 'all' ? t.common.all : f === 'published' ? t.status.published : t.status.draft}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        isEmpty={filtered.length === 0}
        empty={t.common.empty}
        head={
          <>
            <Th>{t.sites.name}</Th>
            <Th>{t.common.owner}</Th>
            <Th>{t.sites.type}</Th>
            <Th>{t.common.status}</Th>
            <Th>{t.common.updated}</Th>
            <Th>{t.sites.url}</Th>
            <Th className="text-right">{t.common.actions}</Th>
          </>
        }
      >
        {filtered.map((s) => (
          <Tr key={s.id}>
            <Td className="font-medium">{s.name}</Td>
            <Td className="text-muted-foreground">
              {s.ownerEmail ? (
                <Link href={`/admin/users/${s.ownerId}`} className="hover:text-brand">
                  {s.ownerEmail}
                </Link>
              ) : (
                t.common.none
              )}
            </Td>
            <Td>
              <select
                value={siteKindOf({ project_type: s.projectType, commerce_mode: s.commerceMode })}
                disabled={pending}
                onChange={(e) => openChange(s, e.target.value as SelectableSiteKind)}
                aria-label={t.sites.type}
                className="h-8 rounded-md border border-border bg-card/70 px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-60"
              >
                <option value="corporate">{t.sites.corporate}</option>
                <option value="ecommerce">{t.sites.ecommerce}</option>
                {siteKindOf({ project_type: s.projectType, commerce_mode: s.commerceMode }) === 'catalog' ? (
                  <option value="catalog" disabled>
                    {t.sites.catalog}
                  </option>
                ) : null}
              </select>
            </Td>
            <Td>
              <StatusBadge tone={s.published ? 'success' : 'muted'}>
                {s.published ? t.status.published : t.status.draft}
              </StatusBadge>
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">
              {dateFmt.format(new Date(s.updatedAt))}
            </Td>
            <Td>
              {s.published && s.slug ? (
                <a
                  href={tenantUrl(s.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  {`${s.slug}.gloval.site`}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span className="text-muted-foreground">{t.common.none}</span>
              )}
            </Td>
            <Td className="sticky right-0 whitespace-nowrap border-l border-border bg-card text-right">
              <div className="flex items-center justify-end gap-2">
                {s.projectType === 'ecommerce' && s.commerceMode !== 'none' && (
                  <Link
                    href={`/ecommerce/${s.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <Package className="size-3.5" />
                    {t.sites.products}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setAuraSite({ id: s.id, name: s.name })}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Sparkles className="size-3.5" />
                  {t.sites.auraButton}
                </button>
                <Link
                  href={`/editor/${s.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-brand/40 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
                >
                  <Pencil className="size-3.5" />
                  {t.sites.edit}
                </Link>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>

      <CursorAuraDialog site={auraSite} onClose={() => setAuraSite(null)} />

      <ConfirmDialog
        open={change !== null}
        title={`${t.sites.typeChangeTitle}${change ? ` — ${change.site.name}` : ''}`}
        description={t.sites.typeChangeDescription}
        confirmLabel={t.sites.typeChangeSubmit}
        cancelLabel={t.common.cancel}
        confirmDisabled={pending || !change?.impact || change.impact.blocker !== null || note.trim().length < MIN_TYPE_CHANGE_NOTE}
        onConfirm={confirmChange}
        onCancel={closeChange}
      >
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {change && !change.impact && !change.error && (
            <p className="text-muted-foreground">{t.sites.typeChangeLoading}</p>
          )}
          {change?.impact && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-background/50 p-3">
              <dt className="text-muted-foreground">{t.sites.typeChangeFrom}</dt>
              <dd className="font-medium">{kindLabel[change.impact.from]}</dd>
              <dt className="text-muted-foreground">{t.sites.typeChangeTo}</dt>
              <dd className="font-medium">{kindLabel[change.impact.to]}</dd>
              <dt className="text-muted-foreground">{t.sites.typeChangeProducts}</dt>
              <dd>{change.impact.products}</dd>
              <dt className="text-muted-foreground">{t.sites.typeChangeOrders}</dt>
              <dd>{change.impact.orders}</dd>
              <dt className="text-muted-foreground">{t.sites.typeChangeSections}</dt>
              <dd>{change.impact.hasStoreSections ? t.sites.typeChangeYes : t.sites.typeChangeNo}</dd>
            </dl>
          )}
          {change?.impact?.published && (
            <p className="text-xs text-muted-foreground">{t.sites.typeChangePublished}</p>
          )}
          {change?.impact?.blocker && (
            <p role="alert" className="text-xs text-destructive">
              {errorText(change.impact.blocker)}
            </p>
          )}
          {change?.error && (
            <p role="alert" className="text-xs text-destructive">
              {change.error}
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">{t.sites.typeChangeNoteLabel}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_TYPE_CHANGE_NOTE}
              rows={3}
              placeholder={t.sites.typeChangeNotePlaceholder}
              className="rounded-lg border border-border bg-card/70 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </label>
        </div>
      </ConfirmDialog>
    </div>
  )
}
