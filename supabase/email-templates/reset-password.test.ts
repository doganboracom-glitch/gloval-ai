import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(
  join(process.cwd(), 'supabase/email-templates/reset-password.html'),
  'utf8',
)
const recoveryLink =
  'href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery"'

describe('password reset email template', () => {
  it('uses the token-hash recovery route for every primary and alternate link', () => {
    expect(template).not.toContain('{{ .ConfirmationURL }}')
    expect(template).toContain(recoveryLink)
    expect(template.split(recoveryLink).length - 1).toBeGreaterThanOrEqual(2)
  })
})
