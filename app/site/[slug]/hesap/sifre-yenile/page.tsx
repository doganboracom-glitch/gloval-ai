import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { ResetPassword } from '@/components/store/reset-password'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Şifre Yenile',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { slug } = await params
  const { token } = await searchParams
  const site = await getPublishedSite(slug)
  if (!site) notFound()

  return (
    <ResetPassword
      slug={slug}
      storeName={site.name}
      legacyToken={typeof token === 'string' ? token : ''}
    />
  )
}
