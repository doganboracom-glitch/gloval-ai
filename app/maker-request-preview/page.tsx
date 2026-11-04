import { notFound } from 'next/navigation'
import { AdminShell } from '@/components/admin/admin-shell'
import { AdminMakerRequestsView } from '@/components/admin/maker-requests-view'
import { MakerRequestDetailView } from '@/components/admin/maker-request-detail-view'
import { LanguageProvider } from '@/components/language-provider'
import { PricingJetBand } from '@/components/pricing/pricing-jet-band'
import type { Lang } from '@/lib/i18n'
import type { MakerRequest } from '@/lib/maker-requests/types'

const request: MakerRequest = {
  id: '11111111-1111-4111-8111-111111111111',
  created_at: '2026-11-04T09:15:00.000Z',
  user_id: '22222222-2222-4222-8222-222222222222',
  full_name: 'Derya Yılmaz',
  phone: '+90 532 000 00 00',
  email: 'derya@example.test',
  budget_range: '10000-25000',
  reference_links: ['https://atelier.example.test', 'https://studio.example.test'],
  status: 'answered',
  consent_version: 'kvkk-2026-11-v1',
  consent_at: '2026-11-04T09:16:00.000Z',
  ip_hash: 'a'.repeat(64),
  admin_notes: 'Görüşmede proje kapsamını netleştir.',
  replied_at: '2026-11-04T10:00:00.000Z',
  reply_text: 'Merhaba Derya, ihtiyaçlarınızı değerlendirebiliriz. Uygun olduğunuz zamanı paylaşır mısınız?',
}

const items: MakerRequest[] = [
  request,
  {
    ...request,
    id: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-11-03T14:30:00.000Z',
    full_name: 'Arda Demir',
    phone: '+90 555 111 22 33',
    email: 'arda@example.test',
    budget_range: '5000-10000',
    status: 'new',
    replied_at: null,
    reply_text: null,
  },
  {
    ...request,
    id: '44444444-4444-4444-8444-444444444444',
    created_at: '2026-11-02T11:00:00.000Z',
    full_name: 'Mina Kaya',
    phone: '+90 555 222 33 44',
    email: 'mina@example.test',
    budget_range: '25000-plus',
    status: 'closed',
  },
]

export default async function MakerRequestPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; screen?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()

  const params = await searchParams
  const lang: Lang = params.lang === 'en' ? 'en' : 'tr'
  const screen = params.screen ?? 'band'
  let content

  if (screen === 'admin-list') {
    content = (
      <AdminShell adminEmail="ops@example.test">
        <AdminMakerRequestsView items={items} schemaReady />
      </AdminShell>
    )
  } else if (screen === 'admin-detail') {
    content = (
      <AdminShell adminEmail="ops@example.test">
        <MakerRequestDetailView request={request} />
      </AdminShell>
    )
  } else {
    content = (
      <main className="mx-auto flex min-h-svh max-w-6xl items-center px-4 py-8">
        <PricingJetBand isAuthenticated={false} makerRequestsEnabled />
      </main>
    )
  }

  return <LanguageProvider key={`${lang}-${screen}`} initialLang={lang}>{content}</LanguageProvider>
}
