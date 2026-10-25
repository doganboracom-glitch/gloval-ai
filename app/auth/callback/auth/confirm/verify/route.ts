import { redirectLegacyConfirmationUrl } from '@/lib/auth-confirm-redirect'
import type { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  return redirectLegacyConfirmationUrl(request, '/auth/confirm/verify')
}
