'use client'

import { useState } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { onSiteNavClick } from '@/components/website-renderer/primitives'
import { useDemoHref, useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import { Lightbox } from '@/components/website-renderer/lightbox'
import type { LightboxItem, LightboxLang } from '@/lib/lightbox-nav'
import {
  galleryAlbumPath,
  resolveGalleryPages,
  type GalleryAlbumEntry,
  type GalleryPhoto,
  type GalleryVideoEntry,
} from '@/lib/gallery-pages'

export function useLink() {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  return {
    href: (raw: string) => demoHref(normalize(raw)),
    onClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => onSiteNavClick(e, href, nav),
  }
}

export function PageHeader({
  lang,
  trail,
  title,
  subtitle,
}: {
  lang: 'tr' | 'en'
  trail: Array<{ label: string; href?: string }>
  title: string
  subtitle?: string
}) {
  const link = useLink()
  const crumbs = [{ label: lang === 'en' ? 'Home' : 'Ana sayfa', href: '/' }, ...trail]
  // A plain theme-surface band: no cover photo, so the page heading never competes with the pictures below it.
  return (
    <header
      data-gv-detail-band
      className="px-6 py-10 sm:py-12"
      style={{
        color: 'var(--site-fg)',
        backgroundImage: 'linear-gradient(180deg, var(--site-card), var(--site-muted))',
        borderBottom: '1px solid var(--site-border)',
      }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <nav aria-label="Breadcrumb" data-gv-breadcrumb>
          <ol className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
            {crumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {i > 0 ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {crumb.href ? (
                  <a
                    href={link.href(crumb.href)}
                    onClick={(e) => link.onClick(e, link.href(crumb.href as string))}
                    className="underline-offset-4 hover:underline"
                    style={{ color: 'var(--site-muted-fg)' }}
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span aria-current="page" className="font-medium" style={{ color: 'var(--site-fg)' }}>
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <h1
          className="mt-4 text-balance text-3xl font-bold sm:text-4xl lg:text-5xl"
          style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 max-w-2xl text-pretty text-base sm:text-lg" style={{ color: 'var(--site-muted-fg)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  )
}

function PhotoGrid({ photos, lang }: { photos: GalleryPhoto[]; lang: LightboxLang }) {
  const [open, setOpen] = useState<number | null>(null)
  const items: LightboxItem[] = photos.map((p) => ({
    kind: 'image',
    src: p.src,
    alt: p.alt,
    ...(p.caption ? { caption: p.caption } : {}),
  }))
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" data-gv-photo-grid>
        {photos.map((photo, i) => (
          <li key={`${photo.index}-${photo.src}`}>
            <figure
              className="overflow-hidden"
              style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
            >
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={`${photo.alt} - ${lang === 'en' ? 'enlarge' : 'büyüt'}`}
                aria-haspopup="dialog"
                className="block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                style={{ outlineColor: 'var(--site-primary)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full object-cover"
                />
              </button>
              {photo.caption ? (
                <figcaption className="px-3 py-2 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
                  {photo.caption}
                </figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>
      {open !== null ? (
        <Lightbox items={items} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} lang={lang} />
      ) : null}
    </>
  )
}

function AlbumCard({ album, href, countLabel }: { album: GalleryAlbumEntry; href: string; countLabel: string }) {
  const link = useLink()
  const target = link.href(href)
  return (
    <a
      href={target}
      onClick={(e) => link.onClick(e, target)}
      className="block overflow-hidden transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: 'var(--site-card)',
        border: '1px solid var(--site-border)',
        borderRadius: 'var(--site-radius)',
        outlineColor: 'var(--site-primary)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={album.cover.src}
        alt={album.cover.alt}
        loading="lazy"
        decoding="async"
        className="aspect-[4/3] w-full object-cover"
      />
      <span className="block p-4">
        <span
          className="block text-base font-semibold"
          style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
        >
          {album.name}
        </span>
        <span className="mt-1 block text-sm" style={{ color: 'var(--site-muted-fg)' }}>
          {countLabel}
        </span>
      </span>
    </a>
  )
}

/**
 * `/galeri`: album cards when the owner made albums, otherwise the plain photo grid.
 * `albumSlug` set renders one album (`/galeri/<album>`). Content lives on the gallery section.
 */
export function GalleryDetailPage({ site, albumSlug }: { site: WebsiteSchema; albumSlug: string | null }) {
  const resolved = resolveGalleryPages(site)
  const { gallery, lang } = resolved
  if (!gallery.active) return null

  const count = (n: number) => (lang === 'en' ? `${n} ${n === 1 ? 'photo' : 'photos'}` : `${n} fotoğraf`)
  const album = albumSlug && gallery.hasAlbums ? gallery.albums.find((a) => a.slug === albumSlug.toLowerCase()) : null

  if (album) {
    return (
      <div id="gallery-album" data-gv-detail-page>
        <PageHeader
          lang={lang}
          trail={[{ label: gallery.title, href: `/${gallery.slug}` }, { label: album.name }]}
          title={album.name}
          subtitle={count(album.photos.length)}
        />
        <div className="px-6 py-12 sm:py-16">
          <div className="mx-auto w-full max-w-5xl">
            <PhotoGrid photos={album.photos} lang={lang} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div id="gallery-detail" data-gv-detail-page>
      <PageHeader
        lang={lang}
        trail={[{ label: gallery.title }]}
        title={gallery.section?.title?.trim() || gallery.title}
        subtitle={gallery.section?.subtitle?.trim() || undefined}
      />
      <div className="px-6 py-12 sm:py-16">
        <div className="mx-auto w-full max-w-5xl">
          {gallery.hasAlbums ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gallery.albums.map((a) => (
                <li key={a.id}>
                  <AlbumCard album={a} href={galleryAlbumPath(gallery.slug, a.slug)} countLabel={count(a.photos.length)} />
                </li>
              ))}
            </ul>
          ) : (
            <PhotoGrid photos={gallery.photos} lang={lang} />
          )}
        </div>
      </div>
    </div>
  )
}

function VideoCard({
  video,
  playLabel,
  onPlay,
}: {
  video: GalleryVideoEntry
  playLabel: string
  onPlay: () => void
}) {
  return (
    <figure
      className="overflow-hidden"
      style={{
        backgroundColor: 'var(--site-card)',
        border: '1px solid var(--site-border)',
        borderRadius: 'var(--site-radius)',
      }}
    >
      <div className="relative aspect-video w-full" style={{ backgroundColor: 'var(--site-muted)' }}>
        <button
          type="button"
          onClick={onPlay}
          aria-label={`${playLabel}: ${video.name}`}
          aria-haspopup="dialog"
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
          style={{
            outlineColor: 'var(--site-primary)',
            ...(video.cover
              ? {}
              : {
                  backgroundImage:
                    'linear-gradient(135deg, var(--site-primary), color-mix(in srgb, var(--site-primary) 45%, #000))',
                }),
          }}
        >
          {video.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.cover.src}
              alt={video.cover.alt}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <span
            className="relative inline-flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105"
            style={{
              backgroundColor: video.cover ? 'var(--site-primary)' : 'rgba(255,255,255,0.92)',
              color: video.cover ? 'var(--site-primary-fg, #fff)' : '#111',
            }}
          >
            <Play className="h-6 w-6" aria-hidden="true" />
          </span>
        </button>
      </div>
      <figcaption
        className="px-4 py-3 text-base font-semibold"
        style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
      >
        {video.name}
      </figcaption>
    </figure>
  )
}

/** `/videolar`: one card per valid video; the player opens in the lightbox only after the visitor presses play. */
export function VideosDetailPage({ site }: { site: WebsiteSchema }) {
  const { videos, lang } = resolveGalleryPages(site)
  const [open, setOpen] = useState<number | null>(null)
  if (!videos.active) return null
  const items: LightboxItem[] = videos.items.map((v) => ({ kind: 'video', embedUrl: v.embedUrl, title: v.name }))
  return (
    <div id="videos-detail" data-gv-detail-page>
      <PageHeader
        lang={lang}
        trail={[{ label: videos.title }]}
        title={videos.title}
        subtitle={videos.section?.subtitle?.trim() || undefined}
      />
      <div className="px-6 py-12 sm:py-16">
        <ul className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.items.map((video, i) => (
            <li key={video.id}>
              <VideoCard video={video} playLabel={lang === 'en' ? 'Play' : 'Oynat'} onPlay={() => setOpen(i)} />
            </li>
          ))}
        </ul>
      </div>
      {open !== null ? (
        <Lightbox items={items} index={open} onIndexChange={setOpen} onClose={() => setOpen(null)} lang={lang} />
      ) : null}
    </div>
  )
}
