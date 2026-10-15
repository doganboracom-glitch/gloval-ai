'use client'

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { IconBtn, TextField } from '@/components/editor/editor-fields'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'
import { pageLimitForPlan } from '@/lib/page-limits'
import { SITE_PAGE_HARD_CAP, type PlanCode } from '@/lib/pricing-config'

const COPY = {
  tr: {
    title: 'Sayfalar',
    usage: (n: number, limit: number) => `${n} / ${limit} sayfa`,
    overLimit: (limit: number) =>
      `Paketiniz ${limit} sayfaya izin veriyor. Mevcut sayfalar korunur; yeni sayfa için paketinizi yükseltin.`,
    atLimit: (limit: number) => `Sayfa sınırına (${limit}) ulaştınız. Daha fazla sayfa için paketinizi yükseltin.`,
    add: 'Sayfa ekle',
    newPage: 'Yeni sayfa',
    name: 'Sayfa adı',
    slug: 'Adres (URL)',
    seoTitle: 'Arama başlığı',
    seoDescription: 'Arama açıklaması',
    indexable: 'Arama motorlarında göster',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Sayfayı sil',
    home: 'Ana sayfa',
  },
  en: {
    title: 'Pages',
    usage: (n: number, limit: number) => `${n} / ${limit} pages`,
    overLimit: (limit: number) =>
      `Your plan allows ${limit} pages. Existing pages are kept; upgrade your plan to add new ones.`,
    atLimit: (limit: number) => `You reached the page limit (${limit}). Upgrade your plan for more pages.`,
    add: 'Add page',
    newPage: 'New page',
    name: 'Page name',
    slug: 'Address (URL)',
    seoTitle: 'Search title',
    seoDescription: 'Search description',
    indexable: 'Show in search engines',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete page',
    home: 'Home',
  },
} as const

export function PagesManager({
  site,
  planCode,
  onDispatch,
}: {
  site: WebsiteSchema
  planCode: PlanCode
  onDispatch: (op: EditOperation) => void
}) {
  const { lang } = useLanguage()
  const c = lang === 'tr' ? COPY.tr : COPY.en
  const limit = Math.min(pageLimitForPlan(planCode), SITE_PAGE_HARD_CAP)
  const count = site.pages.length
  const canAdd = count < limit
  const homeIndex = Math.max(
    0,
    site.pages.findIndex((p) => p.isHome === true),
  )

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{c.title}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{c.usage(count, limit)}</span>
      </div>
      {count > limit && <p className="text-[11px] leading-snug text-muted-foreground">{c.overLimit(limit)}</p>}
      {count === limit && <p className="text-[11px] leading-snug text-muted-foreground">{c.atLimit(limit)}</p>}

      {site.pages.map((page, pageIndex) => {
        const isHome = pageIndex === homeIndex
        return (
          <details key={`${page.slug}-${pageIndex}`} className="rounded-lg border border-border bg-card/40">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium">
              <span className="min-w-0 flex-1 truncate">{page.title}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {isHome ? '/' : `/${page.slug}`}
              </span>
            </summary>
            <div className="flex flex-col gap-2 border-t border-border p-3">
              <TextField
                label={c.name}
                value={page.title}
                onCommit={(v) => onDispatch({ op: 'renamePage', pageIndex, title: v })}
              />
              {!isHome && (
                <TextField
                  label={c.slug}
                  value={page.slug}
                  mono
                  onCommit={(v) => onDispatch({ op: 'renamePage', pageIndex, title: page.title, slug: v })}
                />
              )}
              <TextField
                label={c.seoTitle}
                value={page.seo?.title ?? ''}
                onCommit={(v) => onDispatch({ op: 'setPageSeo', pageIndex, title: v })}
              />
              <TextField
                label={c.seoDescription}
                value={page.seo?.description ?? ''}
                multiline
                rows={2}
                onCommit={(v) => onDispatch({ op: 'setPageSeo', pageIndex, description: v })}
              />
              {page.kind !== 'legal' && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={page.indexable !== false}
                    onChange={(e) => onDispatch({ op: 'setPageSeo', pageIndex, indexable: e.target.checked })}
                  />
                  {c.indexable}
                </label>
              )}
              <div className="flex items-center justify-end gap-1">
                <IconBtn
                  label={c.up}
                  small
                  disabled={pageIndex === 0 || (pageIndex === 1 && homeIndex === 0)}
                  onClick={() => onDispatch({ op: 'movePage', pageIndex, direction: 'up' })}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  label={c.down}
                  small
                  disabled={pageIndex === count - 1 || isHome}
                  onClick={() => onDispatch({ op: 'movePage', pageIndex, direction: 'down' })}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  label={c.remove}
                  small
                  disabled={isHome || count <= 1}
                  onClick={() => onDispatch({ op: 'removePage', pageIndex })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </div>
          </details>
        )
      })}

      <button
        type="button"
        disabled={!canAdd}
        onClick={() => onDispatch({ op: 'addPage', title: c.newPage })}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {c.add}
      </button>
    </div>
  )
}
