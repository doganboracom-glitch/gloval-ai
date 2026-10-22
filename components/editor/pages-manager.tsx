'use client'

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { IconBtn, TextField } from '@/components/editor/editor-fields'
import { InfoPageTemplates } from '@/components/editor/info-page-templates'
import type { EditOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'
import { pageLimitForPlan } from '@/lib/page-limits'
import {
  countHeaderEntries,
  isProductsEntry,
  menuGapLabels,
  MENU_MAX,
  pageMenuKey,
  resolveHeaderMenu,
} from '@/lib/site-menu'
import { pageNavItems } from '@/lib/website-pages'
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
    inHeader: 'Üst menüde göster',
    inFooter: 'Alt bilgide göster',
    menuLabel: 'Menü adı',
    headerFull: (max: number) => `Üst menü en fazla ${max} öğe alır. Yer açmak için başka bir öğeyi kapatın.`,
    orderTitle: 'Menü sırası',
    submenuTitle: 'Ürünler altında kategorileri göster',
    submenuHint: 'Ürün kategorilerinizi açılır menü olarak listeler (2 veya daha fazla kategori varsa).',
    blog: 'Blog',
    contactHint: (labels: string) => `Üst menünüzde ${labels} yok. Ziyaretçilerin kolayca bulması için eklemek ister misiniz?`,
    contactAdd: 'Sayfaları üst menüye ekle',
    contactDismiss: 'Gerek yok',
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
    inHeader: 'Show in header menu',
    inFooter: 'Show in footer',
    menuLabel: 'Menu label',
    headerFull: (max: number) => `The header holds up to ${max} items. Turn another item off to make room.`,
    orderTitle: 'Menu order',
    submenuTitle: 'Show categories under Products',
    submenuHint: 'Lists your product categories as a drop-down (2 or more categories).',
    blog: 'Blog',
    contactHint: (labels: string) => `Your header has no ${labels}. Add them so visitors can find them easily?`,
    contactAdd: 'Add pages to the header menu',
    contactDismiss: 'No thanks',
  },
} as const

export function PagesManager({
  site,
  planCode,
  projectId,
  blogInMenu = false,
  onDispatch,
}: {
  site: WebsiteSchema
  planCode: PlanCode
  projectId?: string | null
  /** True when the published site shows a blog entry in the header. */
  blogInMenu?: boolean
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
  const menu = resolveHeaderMenu({
    pages: pageNavItems(site),
    links: [],
    blog: blogInMenu,
    blogLabel: c.blog,
    menuOrder: site.navigation.menuOrder,
  }).filter((entry) => entry.kind !== 'link')
  const headerFull = countHeaderEntries(menu) >= MENU_MAX
  const gapLabels = site.navigation.contactSuggestionDismissed ? [] : menuGapLabels(site, lang === 'en' ? 'en' : 'tr')
  const showContactHint = gapLabels.length > 0
  const moveMenuEntry = (from: number, delta: -1 | 1) => {
    const keys = menu.map((entry) => entry.key)
    const to = from + delta
    if (to < 0 || to >= keys.length) return
    ;[keys[from], keys[to]] = [keys[to], keys[from]]
    onDispatch({ op: 'setMenuOrder', order: keys })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{c.title}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{c.usage(count, limit)}</span>
      </div>
      {showContactHint && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand/40 bg-card/40 p-3">
          <p className="text-[11px] leading-snug text-foreground">{c.contactHint(gapLabels.join(', '))}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDispatch({ op: 'resolveContactSuggestion', accept: true, lang: lang === 'en' ? 'en' : 'tr' })}
              className="rounded-md bg-brand px-2.5 py-1 text-[11px] font-medium text-brand-foreground"
            >
              {c.contactAdd}
            </button>
            <button
              type="button"
              onClick={() => onDispatch({ op: 'resolveContactSuggestion', accept: false })}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {c.contactDismiss}
            </button>
          </div>
        </div>
      )}
      {count > limit && <p className="text-[11px] leading-snug text-muted-foreground">{c.overLimit(limit)}</p>}
      {count === limit && <p className="text-[11px] leading-snug text-muted-foreground">{c.atLimit(limit)}</p>}

      {site.pages.map((page, pageIndex) => {
        const isHome = pageIndex === homeIndex
        const inHeader = menu.some((entry) => entry.key === pageMenuKey(page))
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
                label={c.menuLabel}
                value={page.menuLabel ?? ''}
                onCommit={(v) => onDispatch({ op: 'setPageMenu', pageIndex, menuLabel: v })}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={inHeader}
                  disabled={!inHeader && headerFull}
                  onChange={(e) => onDispatch({ op: 'setPageMenu', pageIndex, showInHeader: e.target.checked })}
                />
                {c.inHeader}
              </label>
              {!inHeader && headerFull && (
                <p className="text-[11px] leading-snug text-muted-foreground">{c.headerFull(MENU_MAX)}</p>
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={page.showInFooter === true}
                  onChange={(e) => onDispatch({ op: 'setPageMenu', pageIndex, showInFooter: e.target.checked })}
                />
                {c.inFooter}
              </label>
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

      {menu.some(isProductsEntry) && (
        <label className="flex items-start gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={site.navigation.productsSubmenu !== false}
            onChange={(e) => onDispatch({ op: 'setProductsSubmenu', enabled: e.target.checked })}
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">{c.submenuTitle}</span>
            <span className="text-[11px] leading-snug">{c.submenuHint}</span>
          </span>
        </label>
      )}

      {menu.length > 1 && (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card/40 p-3">
          <span className="text-xs font-medium text-foreground">{c.orderTitle}</span>
          <ol className="flex flex-col gap-1">
            {menu.map((entry, i) => (
              <li key={entry.key} className="flex items-center gap-1 text-xs">
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                <IconBtn label={c.up} small disabled={i === 0} onClick={() => moveMenuEntry(i, -1)}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label={c.down} small disabled={i === menu.length - 1} onClick={() => moveMenuEntry(i, 1)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </IconBtn>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        type="button"
        disabled={!canAdd}
        onClick={() => onDispatch({ op: 'addPage', title: c.newPage })}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        {c.add}
      </button>

      <InfoPageTemplates site={site} projectId={projectId} canAdd={canAdd} onDispatch={onDispatch} />
    </div>
  )
}
