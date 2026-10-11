import { NextRequest, NextResponse } from 'next/server'
import { GBP_SCOPE, redirectUri, requirePracticeAdmin, signState } from '@/lib/gbp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/gbp/connect?practiceId=…&returnTo=/admin/… → redirects to Google consent screen
export async function GET(req: NextRequest) {
  const auth = await requirePracticeAdmin(req.nextUrl.searchParams.get('practiceId') ?? undefined)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rt = req.nextUrl.searchParams.get('returnTo') ?? '/'
  const returnTo = rt.startsWith('/') && !rt.startsWith('//') ? rt : '/'

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req.nextUrl.origin),
    response_type: 'code',
    scope: `${GBP_SCOPE} openid email`,
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    include_granted_scopes: 'true',
    state: signState({ practiceId: auth.practiceId, userId: auth.user.id, returnTo }),
  })
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
