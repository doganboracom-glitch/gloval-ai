import type { Lang } from '@/lib/i18n'
import { pickLang } from '@/lib/i18n'

/**
 * Centralized demo content
 * ------------------------
 * Structured data that powers the fully navigable emlak (real-estate) demo:
 * the listings index (`/demo/emlak/ilanlar`) and every listing detail page
 * (`/demo/emlak/ilan/[slug]`) read from the SAME source here, so a card and
 * its detail page can never drift. All imagery points at real files under
 * `public/demos/emlak/` — never placeholders or gradients.
 */

type L = { tr: string; en: string }

export type PropertyListing = {
  slug: string
  title: L
  status: L
  price: string
  location: L
  rooms: string
  bathrooms: string
  grossArea: string
  netArea: string
  buildingAge: L
  floor: L
  image: string
  gallery: string[]
  description: L
  features: L[]
}

const INTERIORS = [
  '/demos/emlak/listings/interior-living.webp',
  '/demos/emlak/listings/interior-kitchen.webp',
  '/demos/emlak/listings/interior-bedroom.webp',
]

export const emlakListings: PropertyListing[] = [
  {
    slug: 'modern-villa',
    title: { tr: 'Modern Villa', en: 'Modern Villa' },
    status: { tr: 'Satılık', en: 'For Sale' },
    price: '₺24.500.000',
    location: { tr: 'Zekeriyaköy, İstanbul', en: 'Zekeriyaköy, Istanbul' },
    rooms: '5+2',
    bathrooms: '4',
    grossArea: '420 m²',
    netArea: '365 m²',
    buildingAge: { tr: '2 yıllık', en: '2 years' },
    floor: { tr: 'Müstakil (3 kat)', en: 'Detached (3 floors)' },
    image: '/demos/emlak/listings/modern-villa.webp',
    gallery: ['/demos/emlak/listings/modern-villa.webp', ...INTERIORS],
    description: {
      tr: 'Geniş bahçesi ve özel havuzuyla modern mimarinin öne çıktığı, doğayla iç içe lüks bir villa. Akıllı ev sistemleri ve yüksek tavanlı ferah yaşam alanları sunar.',
      en: 'A luxury villa where modern architecture meets nature, with a large garden and private pool. Features smart-home systems and airy, high-ceilinged living spaces.',
    },
    features: [
      { tr: 'Özel havuz', en: 'Private pool' },
      { tr: 'Akıllı ev sistemi', en: 'Smart-home system' },
      { tr: 'Kapalı garaj', en: 'Enclosed garage' },
      { tr: 'Bahçe & peyzaj', en: 'Landscaped garden' },
      { tr: 'Güvenlik sistemi', en: 'Security system' },
      { tr: 'Şömine', en: 'Fireplace' },
    ],
  },
  {
    slug: 'deniz-manzarali-rezidans',
    title: { tr: 'Deniz Manzaralı Rezidans', en: 'Sea-View Residence' },
    status: { tr: 'Satılık', en: 'For Sale' },
    price: '₺18.900.000',
    location: { tr: 'Kadıköy, İstanbul', en: 'Kadıköy, Istanbul' },
    rooms: '3+1',
    bathrooms: '2',
    grossArea: '185 m²',
    netArea: '160 m²',
    buildingAge: { tr: 'Yeni', en: 'New' },
    floor: { tr: '14. kat', en: '14th floor' },
    image: '/demos/emlak/listings/deniz-manzarali-rezidans.webp',
    gallery: ['/demos/emlak/listings/deniz-manzarali-rezidans.webp', ...INTERIORS],
    description: {
      tr: 'Kesintisiz deniz manzarasına sahip, tam donanımlı bir rezidans dairesi. Site içinde havuz, spor salonu ve 7/24 güvenlik hizmeti bulunur.',
      en: 'A fully equipped residence apartment with uninterrupted sea views. The complex offers a pool, fitness center and 24/7 security.',
    },
    features: [
      { tr: 'Deniz manzarası', en: 'Sea view' },
      { tr: 'Site içi havuz', en: 'On-site pool' },
      { tr: 'Spor salonu', en: 'Fitness center' },
      { tr: '7/24 güvenlik', en: '24/7 security' },
      { tr: 'Otopark', en: 'Parking' },
      { tr: 'Ankastre mutfak', en: 'Built-in kitchen' },
    ],
  },
  {
    slug: 'sehir-merkezinde-luks-daire',
    title: { tr: 'Şehir Merkezinde Lüks Daire', en: 'Luxury City-Center Apartment' },
    status: { tr: 'Satılık', en: 'For Sale' },
    price: '₺12.750.000',
    location: { tr: 'Şişli, İstanbul', en: 'Şişli, Istanbul' },
    rooms: '2+1',
    bathrooms: '1',
    grossArea: '120 m²',
    netArea: '105 m²',
    buildingAge: { tr: '5 yıllık', en: '5 years' },
    floor: { tr: '8. kat', en: '8th floor' },
    image: '/demos/emlak/listings/sehir-merkezinde-luks-daire.webp',
    gallery: ['/demos/emlak/listings/sehir-merkezinde-luks-daire.webp', ...INTERIORS],
    description: {
      tr: 'Şehrin kalbinde, ulaşım ve sosyal olanaklara yürüme mesafesinde ferah bir daire. Panoramik şehir manzarası ve modern iç tasarım sunar.',
      en: 'A spacious apartment in the heart of the city, within walking distance of transit and amenities. Offers panoramic city views and a modern interior.',
    },
    features: [
      { tr: 'Şehir manzarası', en: 'City view' },
      { tr: 'Metroya yakın', en: 'Near metro' },
      { tr: 'Yerden ısıtma', en: 'Underfloor heating' },
      { tr: 'Balkon', en: 'Balcony' },
      { tr: 'Asansör', en: 'Elevator' },
      { tr: 'Kapıcı hizmeti', en: 'Concierge' },
    ],
  },
  {
    slug: 'bahceli-mustakil-ev',
    title: { tr: 'Bahçeli Müstakil Ev', en: 'Detached House with Garden' },
    status: { tr: 'Satılık', en: 'For Sale' },
    price: '₺9.400.000',
    location: { tr: 'Urla, İzmir', en: 'Urla, İzmir' },
    rooms: '4+1',
    bathrooms: '2',
    grossArea: '240 m²',
    netArea: '210 m²',
    buildingAge: { tr: '8 yıllık', en: '8 years' },
    floor: { tr: 'Müstakil (2 kat)', en: 'Detached (2 floors)' },
    image: '/demos/emlak/listings/bahceli-mustakil-ev.webp',
    gallery: ['/demos/emlak/listings/bahceli-mustakil-ev.webp', ...INTERIORS],
    description: {
      tr: 'Sakin bir mahallede, geniş özel bahçesiyle aileler için ideal müstakil bir ev. Meyve ağaçları, açık teras ve doğal ışık alan iç mekânlar.',
      en: 'A detached house ideal for families, with a large private garden in a quiet neighborhood. Fruit trees, an open terrace and light-filled interiors.',
    },
    features: [
      { tr: 'Özel bahçe', en: 'Private garden' },
      { tr: 'Açık teras', en: 'Open terrace' },
      { tr: 'Otopark', en: 'Parking' },
      { tr: 'Doğalgaz', en: 'Natural gas' },
      { tr: 'Depo alanı', en: 'Storage' },
      { tr: 'Aileye uygun', en: 'Family-friendly' },
    ],
  },
  {
    slug: 'premium-residence',
    title: { tr: 'Premium Residence', en: 'Premium Residence' },
    status: { tr: 'Satılık', en: 'For Sale' },
    price: '₺32.000.000',
    location: { tr: 'Levent, İstanbul', en: 'Levent, Istanbul' },
    rooms: '4+1',
    bathrooms: '3',
    grossArea: '265 m²',
    netArea: '230 m²',
    buildingAge: { tr: 'Yeni', en: 'New' },
    floor: { tr: '22. kat (çatı katı)', en: '22nd floor (penthouse)' },
    image: '/demos/emlak/listings/premium-residence.webp',
    gallery: ['/demos/emlak/listings/premium-residence.webp', ...INTERIORS],
    description: {
      tr: 'Şehrin en prestijli bölgesinde, panoramik manzaralı bir çatı katı residence. Concierge, valet ve özel sosyal alanlarla üst düzey bir yaşam sunar.',
      en: 'A penthouse residence with panoramic views in the city’s most prestigious district. Offers premium living with concierge, valet and private amenities.',
    },
    features: [
      { tr: 'Panoramik manzara', en: 'Panoramic view' },
      { tr: 'Concierge & valet', en: 'Concierge & valet' },
      { tr: 'Özel teras', en: 'Private terrace' },
      { tr: 'Akıllı ev', en: 'Smart home' },
      { tr: 'Spa & havuz', en: 'Spa & pool' },
      { tr: 'Kapalı otopark', en: 'Indoor parking' },
    ],
  },
  {
    slug: 'yatirim-firsati',
    title: { tr: 'Yatırım Fırsatı', en: 'Investment Opportunity' },
    status: { tr: 'Satılık', en: 'For Sale' },
    price: '₺6.250.000',
    location: { tr: 'Çankaya, Ankara', en: 'Çankaya, Ankara' },
    rooms: '1+1',
    bathrooms: '1',
    grossArea: '75 m²',
    netArea: '62 m²',
    buildingAge: { tr: 'Proje aşamasında', en: 'Off-plan' },
    floor: { tr: '3. kat', en: '3rd floor' },
    image: '/demos/emlak/listings/yatirim-firsati.webp',
    gallery: ['/demos/emlak/listings/yatirim-firsati.webp', ...INTERIORS],
    description: {
      tr: 'Yüksek kira getirisi potansiyeli olan, karma kullanımlı yeni bir projede yatırımlık daire. Üniversite ve iş merkezlerine yakın konumda.',
      en: 'An investment apartment in a new mixed-use project with high rental-yield potential. Located near universities and business districts.',
    },
    features: [
      { tr: 'Yüksek kira getirisi', en: 'High rental yield' },
      { tr: 'Merkezi konum', en: 'Central location' },
      { tr: 'Üniversiteye yakın', en: 'Near university' },
      { tr: 'Teslim garantili', en: 'Delivery guarantee' },
      { tr: 'Senetli ödeme', en: 'Installment plan' },
      { tr: 'Ticari potansiyel', en: 'Commercial potential' },
    ],
  },
]

export function getEmlakListing(slug: string): PropertyListing | undefined {
  return emlakListings.find((l) => l.slug === slug)
}

export const emlakListingSlugs = emlakListings.map((l) => l.slug)

/** Convenience accessor for a bilingual field. */
export function t(field: L, lang: Lang): string {
  return pickLang(field, lang)
}
