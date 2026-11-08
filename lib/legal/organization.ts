import { COMPANY } from '@/lib/legal/company'

export const ORGANIZATION_DATA = {
  '@type': 'Organization',
  '@id': `${COMPANY.siteUrl.replace(/\/+$/, '')}/#organization`,
  name: COMPANY.brandName,
  legalName: COMPANY.legalName,
  url: COMPANY.siteUrl,
  logo: new URL('/icon-512x512.png', COMPANY.siteUrl).toString(),
  taxID: COMPANY.taxNumber,
  address: {
    '@type': 'PostalAddress',
    streetAddress: COMPANY.address,
    addressCountry: 'TR',
  },
  email: COMPANY.supportEmail,
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: COMPANY.supportEmail,
    availableLanguage: ['tr', 'en'],
  },
} as const

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
