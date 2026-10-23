import { countCappedSections, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'
import { MENU_MAX } from '@/lib/site-menu'
import { findTeamPage, teamPageTitle } from '@/lib/team'

/**
 * Showcase demo team
 * ------------------
 * Ten made-up people per demo so the home block, the "view full team" link and the `/kadromuz` page can be
 * judged on a realistic amount of content. Every person is flagged `sample` and the demo shows one
 * "Örnek içerik" tag. No photos: people get the ready-made avatars. Demo-only: generation never reads this file.
 */

const PEOPLE: ReadonlyArray<{ name: string; role: { tr: string; en: string } }> = [
  { name: 'Elif Arslan', role: { tr: 'Kurucu ortak', en: 'Co-founder' } },
  { name: 'Mert Kaya', role: { tr: 'Genel müdür', en: 'General manager' } },
  { name: 'Zeynep Aydın', role: { tr: 'Operasyon müdürü', en: 'Operations lead' } },
  { name: 'Can Demir', role: { tr: 'Proje yöneticisi', en: 'Project manager' } },
  { name: 'Selin Yıldız', role: { tr: 'Müşteri ilişkileri', en: 'Client relations' } },
  { name: 'Burak Şahin', role: { tr: 'Uzman danışman', en: 'Senior consultant' } },
  { name: 'Defne Çelik', role: { tr: 'Tasarım sorumlusu', en: 'Design lead' } },
  { name: 'Emre Koç', role: { tr: 'Teknik sorumlu', en: 'Technical lead' } },
  { name: 'Ayşe Polat', role: { tr: 'Finans uzmanı', en: 'Finance specialist' } },
  { name: 'Kerem Aksoy', role: { tr: 'Saha ekibi', en: 'Field team' } },
]

function insertionIndex(sections: Section[]): number {
  const contact = sections.findIndex((s) => s.type === 'contact')
  if (contact !== -1) return contact
  const footer = sections.findIndex((s) => s.type === 'footer')
  return footer === -1 ? sections.length : footer
}

/**
 * Gives a demo a labelled example team block and its own `/demo/<slug>/kadromuz` page, and puts the link in
 * the demo's menu. A demo that already carries a team section, or has no free section slot, is left alone.
 */
export function applyDemoTeam(site: WebsiteSchema, slug: string, lang: 'tr' | 'en'): void {
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
    members: PEOPLE.map((p) => ({ name: p.name, role: p.role[lang], sample: true as const })),
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
