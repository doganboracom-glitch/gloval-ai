import { countCappedSections, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'
import { MENU_MAX } from '@/lib/site-menu'
import { findTeamPage, teamPageTitle } from '@/lib/team'

/**
 * Showcase demo team
 * ------------------
 * Only the dental clinic, law firm and beauty demos carry a team: 6-8 made-up people each, with roles that fit
 * the sector, so the home block, the "view full team" link and the `/kadromuz` page can be judged on realistic
 * content. Every person is flagged `sample`, gets a sample phone (`0555 555 55 5N`), no photo and no social
 * links, and the demo shows one "Örnek içerik" tag. Demo-only: generation never reads this file.
 */

type Person = { name: string; role: { tr: string; en: string } }

const PEOPLE: Readonly<Record<string, ReadonlyArray<Person>>> = {
  'dis-klinigi': [
    { name: 'Elif Arslan', role: { tr: 'Başhekim, Ortodonti uzmanı', en: 'Chief dentist, Orthodontist' } },
    { name: 'Mert Kaya', role: { tr: 'İmplantoloji uzmanı', en: 'Implantology specialist' } },
    { name: 'Zeynep Aydın', role: { tr: 'Pedodonti uzmanı', en: 'Pediatric dentist' } },
    { name: 'Can Demir', role: { tr: 'Endodonti uzmanı', en: 'Endodontist' } },
    { name: 'Selin Yıldız', role: { tr: 'Diş hekimi', en: 'Dentist' } },
    { name: 'Burak Şahin', role: { tr: 'Ağız ve çene cerrahı', en: 'Oral surgeon' } },
    { name: 'Defne Çelik', role: { tr: 'Diş hekimi asistanı', en: 'Dental assistant' } },
    { name: 'Emre Koç', role: { tr: 'Hasta danışmanı', en: 'Patient coordinator' } },
  ],
  hukuk: [
    { name: 'Av. Ayşe Polat', role: { tr: 'Kurucu ortak, Avukat', en: 'Founding partner, Attorney' } },
    { name: 'Av. Kerem Aksoy', role: { tr: 'Ortak, Ticaret hukuku', en: 'Partner, Commercial law' } },
    { name: 'Av. Merve Güneş', role: { tr: 'Aile hukuku avukatı', en: 'Family law attorney' } },
    { name: 'Av. Onur Tekin', role: { tr: 'Ceza hukuku avukatı', en: 'Criminal law attorney' } },
    { name: 'Av. Deniz Özkan', role: { tr: 'İş hukuku avukatı', en: 'Employment law attorney' } },
    { name: 'Gizem Yalçın', role: { tr: 'Hukuk danışmanı', en: 'Legal advisor' } },
    { name: 'Hakan Erdem', role: { tr: 'Stajyer avukat', en: 'Trainee attorney' } },
  ],
  guzellik: [
    { name: 'Nehir Sönmez', role: { tr: 'Kurucu, Estetisyen', en: 'Founder, Aesthetician' } },
    { name: 'Pelin Akın', role: { tr: 'Cilt bakımı uzmanı', en: 'Skin care specialist' } },
    { name: 'Tuğçe Karaca', role: { tr: 'Saç tasarımcısı', en: 'Hair stylist' } },
    { name: 'Ece Başaran', role: { tr: 'Makyöz', en: 'Makeup artist' } },
    { name: 'Sinem Uslu', role: { tr: 'Nail art uzmanı', en: 'Nail artist' } },
    { name: 'Ozan Türk', role: { tr: 'Berber, saç ve sakal', en: 'Barber, hair and beard' } },
    { name: 'Melis Duran', role: { tr: 'Masaj terapisti', en: 'Massage therapist' } },
    { name: 'Irmak Çınar', role: { tr: 'Randevu danışmanı', en: 'Booking coordinator' } },
  ],
}

function insertionIndex(sections: Section[]): number {
  const contact = sections.findIndex((s) => s.type === 'contact')
  if (contact !== -1) return contact
  const footer = sections.findIndex((s) => s.type === 'footer')
  return footer === -1 ? sections.length : footer
}

/**
 * Gives a demo a labelled example team block and its own `/demo/<slug>/kadromuz` page, and adds the menu link when
 * the demo's menu still has room (these menus are usually at `MENU_MAX`, so the home block links to it). A demo that already carries a team section, or has no free section slot, is left alone.
 */
export function applyDemoTeam(site: WebsiteSchema, slug: string, lang: 'tr' | 'en'): void {
  const people = PEOPLE[slug]
  if (!people) return
  if (site.sections.some((s) => s.type === 'team')) return
  if (countCappedSections(site.sections) >= SITE_SECTION_HARD_CAP) return

  const section: Section = {
    type: 'team',
    title: teamPageTitle(lang),
    subtitle:
      lang === 'tr'
        ? 'Bu demodaki kişiler kurgusaldır; kadro alanının nasıl görüneceğini göstermek için eklenmiştir.'
        : 'The people in this demo are fictional, added to show how the team area would look.',
    pageEnabled: true,
    members: people.map((p, i) => ({
      name: p.name,
      role: p.role[lang],
      phone: `0555 555 55 5${i + 1}`,
      sample: true as const,
    })),
  }
  const at = insertionIndex(site.sections)
  site.sections = [...site.sections.slice(0, at), section, ...site.sections.slice(at)]

  if (!findTeamPage(site)) {
    site.pages = [
      ...(site.pages ?? []),
      { slug: lang === 'en' ? 'our-team' : 'kadromuz', title: teamPageTitle(lang), kind: 'detail', detailOf: 'team' },
    ]
  }

  const links = site.navigation.links
  if (links.length < MENU_MAX && !links.some((l) => l.href.includes('kadromuz'))) {
    const entry = { label: teamPageTitle(lang), href: `/demo/${slug}/kadromuz?lang=${lang}` }
    const contactAt = links.findIndex((l) => l.href.includes('/iletisim'))
    links.splice(contactAt === -1 ? links.length : contactAt, 0, entry)
  }
}
