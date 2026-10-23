import { createClient } from '@supabase/supabase-js'
import { fallbackWebsite } from '@/lib/website-schema'
import { seedTestimonialsSection } from '@/lib/testimonials'
import { syncSectionPages } from '@/lib/service-pages'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const email = 'tmp-testimonials-shot@example.com'
  const password = 'Shot-Test-12345!'
  const list = await db.auth.admin.listUsers({ perPage: 200 })
  const old = list.data.users.find((u) => u.email === email)
  if (old) { await db.from('projects').delete().eq('owner_id', old.id); await db.auth.admin.deleteUser(old.id) }
  const { data: u, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  let site = fallbackWebsite('diş kliniği için web sitesi', 'tr')
  if (!site.sections.some((s) => s.type === 'testimonials')) {
    const at = Math.max(0, site.sections.findIndex((s) => s.type === 'contact' || s.type === 'footer'))
    site = { ...site, sections: [...site.sections.slice(0, at), { type: 'testimonials', title: 'Müşteri Yorumları', items: [] } as never, ...site.sections.slice(at)] }
  }
  site = syncSectionPages(seedTestimonialsSection(site))
  const { data: p, error: e2 } = await db.from('projects').insert({ owner_id: u.user.id, name: 'Yorum test', sector: 'Diş kliniği', language: 'tr', status: 'draft', project_type: 'corporate', schema_data: site, commerce_mode: 'none' }).select('id').single()
  if (e2) throw e2
  console.log('PROJECT', p.id, email, password)
}
main().catch((e) => { console.error(e); process.exit(1) })
