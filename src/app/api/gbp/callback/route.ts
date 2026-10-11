import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { encrypt, exchangeCode, listGoogleLocations, serviceSupabase, verifyState } from '@/lib/gbp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Google redirects here after consent. Stores the encrypted refresh token and
// discovers the account's Business Profile locations (none selected by default).
export async function GET(req: NextRequest) {
  let returnTo = '/'
  const back = (msg: string) => {
    const url = req.nextUrl.clone()
    url.pathname = returnTo
    url.search = `?tab=reviews&gbp=${encodeURIComponent(msg)}`
    return NextResponse.redirect(url)
  }

  try {
    const err = req.nextUrl.searchParams.get('error')
    if (err) return back(`Google sign-in cancelled (${err})`)

    const state = verifyState(req.nextUrl.searchParams.get('state') ?? '')
    if (state?.returnTo?.startsWith('/') && !state.returnTo.startsWith('//')) returnTo = state.returnTo
    const user = await getSession()
    if (!state || !user || state.userId !== user.id) return back('Connection expired — please try again')

    const tokens = await exchangeCode(req.nextUrl.searchParams.get('code') ?? '', req.nextUrl.origin)
    if (!tokens.refresh_token) return back('Google did not return a refresh token — remove omsref access in your Google account and reconnect')

    let email: string | null = null
    if (tokens.id_token) {
      try { email = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()).email ?? null } catch {}
    }

    const db = serviceSupabase()
    const { error } = await db.from('gbp_connections').upsert({
      practice_id: state.practiceId,
      google_email: email,
      refresh_token_enc: encrypt(tokens.refresh_token),
      connected_by: user.id,
      connected_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: 'practice_id' })
    if (error) throw error

    const locations = await listGoogleLocations(tokens.access_token)
    if (locations.length) {
      // ignoreDuplicates keeps existing selections/labels on reconnect
      await db.from('gbp_locations').upsert(
        locations.map(l => ({ ...l, practice_id: state.practiceId })),
        { onConflict: 'practice_id,location_name', ignoreDuplicates: true },
      )
    }
    return back(`Connected ${email ?? 'Google account'} — ${locations.length} business profile(s) found. Select the ones to use.`)
  } catch (e) {
    console.error('GET /api/gbp/callback error:', e)
    return back(`Connection failed: ${(e as Error).message.slice(0, 200)}`)
  }
}
