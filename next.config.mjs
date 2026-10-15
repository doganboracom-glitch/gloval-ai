/** @type {import('next').NextConfig} */

// Baseline, defense-in-depth response headers. These are safe for every
// response on the platform. The v0 preview strips framing/CSP headers so the
// app still renders in an iframe there; on the DEPLOYED site they all apply.
const baseSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
  {
    // Deny camera, microphone and geolocation by default. Customer sites
    // (<slug>.gloval.site, custom domains, /site/*) keep this policy; the
    // platform's own pages re-allow only the microphone below.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

// Hosts where the platform UI itself is served (voice dictation lives here).
// Tenant subdomains and customer custom domains never match.
const platformHostPattern =
  '(www\\.)?gloval\\.ai|localhost|[a-z0-9-]+\\.vercel\\.app|[a-z0-9.-]+\\.vusercontent\\.net'

// Re-allows ONLY the microphone for the same-origin platform document;
// camera and geolocation stay denied. Must come after the baseline rule so it
// overrides that header for matching requests.
const platformMicrophoneRule = {
  source: '/:path((?!site(?:/|$)).*)',
  has: [{ type: 'host', value: platformHostPattern }],
  headers: [
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  ],
}

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: '/dashboard/mesajlar', destination: '/dashboard/messages', permanent: true },
      // Store "Teslimat ve İade" moved from iptal-ve-iade. Only the tenant path
      // is redirected here; the platform's own /yasal/iptal-ve-iade is a
      // different document, so tenant HOSTS are handled in middleware.
      {
        source: '/site/:slug/yasal/iptal-ve-iade',
        destination: '/site/:slug/yasal/teslimat-ve-iade',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      // Global baseline for everything.
      {
        source: '/:path*',
        headers: baseSecurityHeaders,
      },
      platformMicrophoneRule,
      // Demo imagery. Anything under a stable url may be replaced later, so it
      // gets a short, revalidated cache; files carrying a content hash
      // (`name.<sha8>.webp`, see scripts/hash-demo-assets.mjs) can never change
      // under the same url and are cached for a year. Order matters: the later
      // rule overrides Cache-Control for hashed files.
      {
        source: '/demos/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }],
      },
      {
        source: '/demos/:dir*/:file([\\w-]+\\.[0-9a-f]{8}\\.webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Clickjacking protection for the platform's authenticated / stateful
      // surfaces. Tenant sites (/site/*) and demo pages (/demo/*) are
      // intentionally NOT framed-locked so they can be embedded/previewed.
      {
        source: '/dashboard/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/editor/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/ecommerce/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/billing/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
      {
        source: '/auth/:path*',
        headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ]
  },
}

export default nextConfig
