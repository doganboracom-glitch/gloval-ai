import type { Metadata } from 'next'
import { ContactPageClient } from '@/components/legal/contact-page-client'

export const metadata: Metadata = {
  title: 'İletişim | GLOVAL AI',
  description:
    'GLOVAL AI iletişim ve kurumsal bilgileri: destek e-postası, telefon, adres ve yasal şirket bilgileri.',
  alternates: { canonical: '/iletisim' },
  openGraph: {
    type: 'website',
    url: '/iletisim',
    title: 'İletişim | GLOVAL AI',
    description: 'GLOVAL AI ile iletişime geçin.',
  },
}

export default function ContactPage() {
  return <ContactPageClient />
}
