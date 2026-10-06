import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.development.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^'(.*)'$/, '$1')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const email = `v0-confirm-test-${Date.now()}@example.com`
const password = 'TestPassword123!'

// Ensure a fresh, unconfirmed user, then generate the real "signup" magic
// link exactly as Supabase would send it in the confirmation email —
// including the emailRedirectTo we pass, so we can inspect where it lands.
const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: false,
})
if (createErr) throw createErr

const redirectTo = process.argv[2]
const { data, error } = await supabase.auth.admin.generateLink({
  type: 'signup',
  email,
  password,
  options: { redirectTo },
})
if (error) throw error

console.log(JSON.stringify({ userId: created.user.id, actionLink: data.properties.action_link }))
