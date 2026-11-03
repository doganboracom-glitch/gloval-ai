'use client'

import { useMemo, useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DomainPriceView } from '@/components/domains/domain-price'
import { useLanguage } from '@/components/language-provider'
import { getPublicDomainTldCatalog } from '@/lib/custom-domains/public-search/actions'
import type {
  PublicSearchErrorCode,
  PublicTldCatalogItem,
} from '@/lib/custom-domains/public-search/service'

const PAGE_SIZE = 24

const copy = {
  tr: {
    more: 'Daha fazla uzantı',
    less: 'Uzantı listesini gizle',
    title: 'Diğer uzantılar',
    filter: 'Uzantı ara',
    filterHint: 'Örneğin: .io, .app veya .com.tr',
    placeholder: 'Uzantı adı yazın',
    count: 'satışa açık uzantı',
    empty: 'Bu aramayla eşleşen uzantı yok.',
    showMore: 'Daha fazla yükle',
    popular: 'Popüler',
    check: 'Sorgula',
    checking: 'Sorgulanıyor',
    loading: 'Alan adı kayıt fiyatları yükleniyor…',
    note: 'Gösterilen tutar standart 1 yıllık kayıt fiyatıdır. Premium alan adlarının kesin fiyatı sorgu sırasında doğrulanır. Bazı uzantılar ek kayıt bilgisi veya belge isteyebilir.',
    unavailable: 'Uzantı kataloğu şu anda yüklenemiyor. Biraz sonra yeniden deneyin.',
    notConfigured: 'Alan adı kataloğu şu anda kullanılamıyor.',
    rateLimited: 'Çok fazla istek gönderildi. {seconds} saniye sonra yeniden deneyin.',
  },
  en: {
    more: 'More extensions',
    less: 'Hide extensions',
    title: 'More extensions',
    filter: 'Search extensions',
    filterHint: 'For example: .io, .app, or .com.tr',
    placeholder: 'Enter an extension',
    count: 'extensions available',
    empty: 'No extensions match this search.',
    showMore: 'Load more',
    popular: 'Popular',
    check: 'Check',
    checking: 'Checking',
    loading: 'Loading registration prices…',
    note: 'Shown amount is the standard 1-year registration price. Premium domain pricing is confirmed during availability checks. Some extensions may require additional registrant details or documents.',
    unavailable: 'The extension catalog is unavailable right now. Please try again shortly.',
    notConfigured: 'The domain catalog is currently unavailable.',
    rateLimited: 'Too many requests. Try again in {seconds} seconds.',
  },
} as const

function errorMessage(error: PublicSearchErrorCode, lang: 'tr' | 'en', retryAfterSeconds?: number) {
  const messages = copy[lang]
  if (error === 'RATE_LIMITED') {
    return messages.rateLimited.replace('{seconds}', String(retryAfterSeconds ?? 60))
  }
  if (error === 'NOT_CONFIGURED') return messages.notConfigured
  return messages.unavailable
}

export function DomainTldCatalog({
  query,
  busy,
  pendingTld,
  onSearch,
}: {
  query: string
  busy: boolean
  pendingTld: string | null
  onSearch: (tld: string) => void
}) {
  const { t, lang } = useLanguage()
  const messages = copy[lang === 'tr' ? 'tr' : 'en']
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<PublicTldCatalogItem[] | null>(null)
  const [filter, setFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loadError, setLoadError] = useState<{ code: PublicSearchErrorCode; retryAfterSeconds?: number } | null>(null)
  const [isLoading, startTransition] = useTransition()

  const filteredItems = useMemo(() => {
    const normalized = filter.trim().replace(/^\./, '').toLowerCase()
    if (!items) return []
    return normalized ? items.filter((item) => item.tld.includes(normalized)) : items
  }, [filter, items])

  function loadCatalog() {
    setLoadError(null)
    startTransition(async () => {
      try {
        const response = await getPublicDomainTldCatalog()
        if (!response.ok) {
          setLoadError({ code: response.error, retryAfterSeconds: response.retryAfterSeconds })
          return
        }
        setItems(response.items)
        setVisibleCount(PAGE_SIZE)
      } catch {
        setLoadError({ code: 'TEMPORARILY_UNAVAILABLE' })
      }
    })
  }

  function toggleCatalog() {
    if (isOpen) {
      setIsOpen(false)
      return
    }
    setIsOpen(true)
    if (!items && !isLoading) loadCatalog()
  }

  return (
    <section aria-label={messages.title}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={isOpen}
        aria-controls="domain-tld-catalog-panel"
        onClick={toggleCatalog}
        disabled={isLoading}
        className="gap-2 px-2 text-muted-foreground hover:text-foreground"
      >
        {isOpen ? messages.less : messages.more}
        {isLoading ? (
          <Loader2 data-icon="inline-end" className="animate-spin" aria-hidden="true" />
        ) : isOpen ? (
          <ChevronUp data-icon="inline-end" aria-hidden="true" />
        ) : (
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        )}
      </Button>

      {isOpen && (
        <Card id="domain-tld-catalog-panel" className="mt-3">
          <CardHeader>
            <CardTitle>{messages.title}</CardTitle>
            <CardDescription>{messages.note}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && !items && (
              <p role="status" className="py-4 text-sm text-muted-foreground">
                {messages.loading}
              </p>
            )}
            {loadError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMessage(loadError.code, lang === 'tr' ? 'tr' : 'en', loadError.retryAfterSeconds)}
              </p>
            )}
            {items && (
              <>
                <FieldGroup className="mb-4">
                  <Field>
                    <FieldLabel htmlFor="domain-tld-filter">{messages.filter}</FieldLabel>
                    <Input
                      id="domain-tld-filter"
                      type="search"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      placeholder={messages.placeholder}
                      autoComplete="off"
                    />
                    <FieldDescription>
                      {filteredItems.length.toLocaleString(locale)} {messages.count} · {messages.filterHint}
                    </FieldDescription>
                  </Field>
                </FieldGroup>

                {filteredItems.length === 0 ? (
                  <p role="status" className="py-4 text-sm text-muted-foreground">
                    {messages.empty}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredItems.slice(0, visibleCount).map((item) => {
                      const isChecking = busy && pendingTld === item.tld
                      return (
                        <li key={item.tld} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="font-mono text-base font-semibold">.{item.tld}</span>
                            {item.popular && <Badge variant="secondary">{messages.popular}</Badge>}
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                            <DomainPriceView
                              quote={item.quote}
                              locale={locale}
                              copy={t.domainSearch}
                              density="compact"
                              periodLabel={t.domainSearch.perYear}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy || !query.trim()}
                              onClick={() => onSearch(item.tld)}
                            >
                              {isChecking ? (
                                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Search data-icon="inline-start" aria-hidden="true" />
                              )}
                              {isChecking ? messages.checking : messages.check}
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {filteredItems.length > visibleCount && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  >
                    {messages.showMore} ({(filteredItems.length - visibleCount).toLocaleString(locale)})
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
