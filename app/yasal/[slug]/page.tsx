import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LegalDocument } from '@/components/legal/legal-document'
import { getLegalDoc, LEGAL_SLUGS } from '@/lib/legal/documents'

/**
 * Tüm yasal dokümanlar tek bir dinamik rota üzerinden sunulur. İçerik
 * `lib/legal/documents.ts` içinde yaşar; her slug derleme sırasında statik
 * olarak üretilir ve kendi meta verisini alır.
 */

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const doc = getLegalDoc(slug)
  if (!doc) return { title: 'Bulunamadı | GLOVAL AI' }
  const url = `/yasal/${doc.slug}`
  // Metadata is emitted once per URL (single route serves both languages);
  // use the Turkish-first content for the canonical meta.
  const meta = doc.tr
  return {
    title: `${meta.title} | GLOVAL AI`,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: `${meta.title} | GLOVAL AI`,
      description: meta.description,
    },
  }
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const doc = getLegalDoc(slug)
  if (!doc) notFound()
  return <LegalDocument doc={doc} />
}
