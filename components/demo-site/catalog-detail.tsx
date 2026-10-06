'use client'

import Link from 'next/link'
import { ArrowLeft, Check, Phone, MessageCircle } from 'lucide-react'
import { pickLang, toBilingual, type Lang } from '@/lib/i18n'
import type { CatalogItem, DemoContact } from '@/lib/demo-catalog'
import { telHref, whatsappHref } from '@/lib/contact-links'
import { EmlakGallery } from '@/components/demo-site/emlak-gallery'
import { DemoAddToCart } from '@/components/demo-site/demo-store'
import { TryOnButton } from '@/components/store/try-on-button'
import { Sparkles } from 'lucide-react'

/**
 * CatalogDetail
 * -------------
 * Generic detail view for a single catalog/service item across every demo:
 * image gallery, price, description, features and working phone/WhatsApp CTAs
 * (prefilled with the item name). Themed via `--site-*`.
 */
export function CatalogDetail({
  item,
  contact,
  lang,
  backHref,
  backLabel,
  enableCart = false,
  enableTryOn = false,
  demoSlug,
}: {
  item: CatalogItem
  contact: DemoContact
  lang: Lang
  backHref: string
  backLabel: string
  /** When true (commerce demos), shows a quantity selector + add-to-cart. */
  enableCart?: boolean
  /** When true, shows the "try it on with AI" button (commerce demos only). */
  enableTryOn?: boolean
  demoSlug?: string
}) {
  const images = item.gallery && item.gallery.length > 0 ? item.gallery : [item.image]
  const waMessage =
    lang === 'tr'
      ? `Merhaba, "${item.name.tr}" hakkında bilgi almak istiyorum.`
      : `Hi, I'd like more information about "${item.name.en}".`
  const callLabel = lang === 'tr' ? 'Hemen Ara' : 'Call Now'
  const waLabel = lang === 'tr' ? 'WhatsApp' : 'WhatsApp'
  const featuresLabel = lang === 'tr' ? 'Öne çıkanlar' : 'Highlights'

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--site-muted-fg)' }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {backLabel}
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <EmlakGallery images={images} alt={pickLang(item.name, lang)} />

        <div className="flex flex-col">
          {item.category ? (
            <span className="mb-2 text-sm font-medium" style={{ color: 'var(--site-primary)' }}>
              {pickLang(item.category, lang)}
            </span>
          ) : null}
          <h1
            className="text-3xl font-bold tracking-tight text-balance sm:text-4xl"
            style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
          >
            {pickLang(item.name, lang)}
          </h1>
          {item.price ? (
            <p className="mt-3 text-2xl font-semibold" style={{ color: 'var(--site-primary)' }}>
              {pickLang(item.price, lang)}
            </p>
          ) : null}
          <p className="mt-4 text-pretty leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
            {pickLang(item.description, lang)}
          </p>

          {item.features.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-fg)' }}>
                {featuresLabel}
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {item.features.map((f) => (
                  <li key={f.tr} className="flex items-center gap-2 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
                    <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden />
                    {pickLang(f, lang)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {enableTryOn && demoSlug ? (
            <div className="mt-6">
              <TryOnButton
                productImage={item.image}
                productName={pickLang(item.name, lang)}
                lang={toBilingual(lang)}
                target={{ mode: 'demo', demoSlug }}
                trigger={({ onClick }) => (
                  <button
                    type="button"
                    onClick={onClick}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      borderRadius: 'var(--site-radius)',
                      border: '1px solid var(--site-border)',
                      color: 'var(--site-fg)',
                    }}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                    {lang === 'tr' ? 'AI ile üzerinde dene' : 'Try it on with AI'}
                  </button>
                )}
              />
            </div>
          ) : null}

          {enableCart ? (
            <DemoAddToCart
              id={item.slug}
              name={pickLang(item.name, lang)}
              priceDisplay={item.price ? pickLang(item.price, lang) : ''}
              image={item.image}
              lang={lang}
            />
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            {enableCart ? null : (
              <a
                href={telHref(contact.phoneTel)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{
                  borderRadius: 'var(--site-radius)',
                  backgroundColor: 'var(--site-primary)',
                  color: 'var(--site-primary-fg)',
                }}
              >
                <Phone className="h-4 w-4" aria-hidden />
                {callLabel}
              </a>
            )}
            <a
              href={whatsappHref(contact.whatsapp, waMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                borderRadius: 'var(--site-radius)',
                border: '1px solid var(--site-border)',
                color: 'var(--site-fg)',
              }}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {waLabel}
            </a>
          </div>

          <p className="mt-4 text-xs" style={{ color: 'var(--site-muted-fg)' }}>
            {contact.phoneDisplay}
          </p>
        </div>
      </div>
    </div>
  )
}
