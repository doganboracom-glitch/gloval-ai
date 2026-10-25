import { NextResponse, type NextRequest } from 'next/server'

type ConfirmationPath = '/auth/confirm' | '/auth/confirm/verify'

export function redirectLegacyConfirmationUrl(
  request: NextRequest,
  pathname: ConfirmationPath,
): NextResponse {
  const destination = request.nextUrl.clone()
  destination.pathname = pathname

  const response = NextResponse.redirect(destination, 307)
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('Cache-Control', 'no-store')
  return response
}
