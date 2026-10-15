import { CookieConsent } from '@/components/cookie-consent'
import { AnalyticsLoader } from '@/components/analytics/analytics-loader'
import type { Metadata, Viewport } from 'next'
import { Geist, Noto_Sans_Arabic, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { cookies } from 'next/headers'
import { LanguageProvider } from '@/components/language-provider'
import { DEFAULT_LANG, LANG_COOKIE, normalizeLang } from '@/lib/i18n'
import { getDirection } from '@/lib/locale-registry'
import { OG_IMAGE_SIZE, SEO_PAGES, ogImageUrlForPage } from '@/lib/seo/page-seo'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})
// Arabic glyph coverage for the `ar` locale only — Geist/Space Grotesk have no
// Arabic glyphs, so without this, Arabic text renders as tofu/empty boxes.
// Loaded unconditionally (next/font/google requires a static call) but only
// referenced by CSS scoped to html[lang="ar"], so it never affects TR/EN.
const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  variable: '--font-noto-arabic',
})

// Fallback for routes without their own metadata; the marketing pages override
// all of it through buildPageMetadata (lib/seo/page-seo.ts).
const siteTitle = SEO_PAGES.home.tr.title
const siteDescription = SEO_PAGES.home.tr.description
const siteOgImage = ogImageUrlForPage('home', 'tr')

export const metadata: Metadata = {
  metadataBase: new URL('https://gloval.ai'),
  title: siteTitle,
  description: siteDescription,
  applicationName: 'GLOVAL AI',
  generator: 'v0.app',
  openGraph: {
    type: 'website',
    siteName: 'GLOVAL AI',
    title: siteTitle,
    description: siteDescription,
    url: 'https://gloval.ai',
    locale: 'tr_TR',
    images: [
      {
      url: siteOgImage,
      ...OG_IMAGE_SIZE,
      alt: 'GLOVAL AI — Yapay zekâ ile gerçek web siteleri',
    },
  ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: [siteOgImage],
  },
  verification: {
    // Google Search Console ownership proof for the gloval.ai property.
    // Next.js renders this as <meta name="google-site-verification" ...>.
    google: 'AcYXG9pqJfl0qDBrB05EcrKZ7RiRWnMm0nXigXH6juw',
  },
  icons: {
    // All icons are cut from the real wordmark (public/logo.png): the "G"
    // glyph on the brand's dark rounded tile, so the tab matches the logo.
    icon: [
      {
        url: '/icon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#221a33',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // The visitor's language choice lives in a cookie so that every route (and
  // full page loads such as the post-login redirect into /dashboard) renders in
  // the selected language instead of resetting to Turkish.
  const cookieStore = await cookies()
  const lang = normalizeLang(cookieStore.get(LANG_COOKIE)?.value) ?? DEFAULT_LANG
  const dir = getDirection(lang)

  return (
    <html
      lang={lang}
      dir={dir}
      className={`dark bg-background ${geist.variable} ${spaceGrotesk.variable} ${notoSansArabic.variable}`}
    >
      <body className="antialiased">
        <LanguageProvider initialLang={lang}>
          {children}
          {/* Consent-gated: CookieConsent renders Vercel Analytics only after
              the visitor grants analytics consent (and only in production). */}
          <CookieConsent />
          <AnalyticsLoader />
        </LanguageProvider>
      </body>
    </html>
  )
}
