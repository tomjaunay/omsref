// Google Business Profile helpers — server-side only.
import crypto from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabase } from './auth'

export const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'

// ── Service-role client (bypasses RLS; never import into client components) ──
export function serviceSupabase(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── Auth: resolve the caller's practice, admins only ──────────────────────────
export async function requirePracticeAdmin(practiceIdOverride?: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('practice_id, role').eq('id', user.id).single()
  if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
    return { error: 'Forbidden', status: 403 as const }
  }
  const practiceId = profile.role === 'superadmin' && practiceIdOverride
    ? practiceIdOverride : profile.practice_id
  return { user, profile, practiceId: practiceId as string }
}

export async function requirePracticeViewer(practiceIdOverride?: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  const { data: profile } = await supabase
    .from('user_profiles').select('practice_id, role').eq('id', user.id).single()
  if (!profile) return { error: 'Forbidden', status: 403 as const }
  const practiceId = profile.role === 'superadmin' && practiceIdOverride
    ? practiceIdOverride : profile.practice_id
  return { user, profile, practiceId: practiceId as string }
}

// ── Token encryption (AES-256-GCM) + signed OAuth state ───────────────────────
function encKey(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY
  if (!raw) throw new Error('TOKEN_ENC_KEY is not set')
  return crypto.createHash('sha256').update(raw).digest()
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64url')).join('.')
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64url'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

export function signState(payload: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString('base64url')
  const sig = crypto.createHmac('sha256', encKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state: string): Record<string, string> | null {
  const [body, sig] = state.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', encKey()).update(body).digest('base64url')
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (Date.now() - Number(data.ts) > 15 * 60 * 1000) return null // 15 min
  return data
}

export function redirectUri(origin: string): string {
  return process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/gbp/callback`
}

// ── Google API calls ─────────────────────────────────────────────────────────
export async function exchangeCode(code: string, origin: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token?: string; id_token?: string }>
}

export async function accessTokenFor(practiceId: string, db = serviceSupabase()): Promise<string> {
  const { data: conn } = await db
    .from('gbp_connections').select('refresh_token_enc').eq('practice_id', practiceId).single()
  if (!conn) throw new Error('No Google account connected for this practice')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: decrypt(conn.refresh_token_enc),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const msg = `Google token refresh failed (${res.status}) — reconnect the Google account`
    await db.from('gbp_connections').update({ last_error: msg }).eq('practice_id', practiceId)
    throw new Error(msg)
  }
  return (await res.json()).access_token
}

async function gget<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Google API ${res.status} on ${new URL(url).pathname}: ${await res.text()}`)
  return res.json() as Promise<T>
}

interface GAccount { name: string; accountName?: string; type?: string }
interface GLocation {
  name: string
  title: string
  storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string }
}

/** Lists every location on every account the connected Google user can manage. */
export async function listGoogleLocations(token: string) {
  const out: Array<{ account_name: string; location_name: string; title: string; address: string | null }> = []
  let acctPage: string | undefined
  do {
    const a = await gget<{ accounts?: GAccount[]; nextPageToken?: string }>(
      `https://mybusinessaccountmanagement.googleapis.com/v1/accounts${acctPage ? `?pageToken=${acctPage}` : ''}`, token)
    for (const acct of a.accounts ?? []) {
      let locPage: string | undefined
      do {
        const qs = new URLSearchParams({ readMask: 'name,title,storefrontAddress', pageSize: '100' })
        if (locPage) qs.set('pageToken', locPage)
        const l = await gget<{ locations?: GLocation[]; nextPageToken?: string }>(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?${qs}`, token)
        for (const loc of l.locations ?? []) {
          const addr = loc.storefrontAddress
          out.push({
            account_name: acct.name,
            location_name: loc.name,
            title: loc.title,
            address: addr ? [...(addr.addressLines ?? []), addr.locality, addr.postalCode].filter(Boolean).join(', ') : null,
          })
        }
        locPage = l.nextPageToken
      } while (locPage)
    }
    acctPage = a.nextPageToken
  } while (acctPage)
  return out
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

interface GReview {
  reviewId: string
  starRating: keyof typeof STARS | 'STAR_RATING_UNSPECIFIED'
  comment?: string
  createTime: string
  updateTime?: string
  reviewReply?: { comment: string; updateTime: string }
}

/**
 * Pulls reviews for every selected location of a practice and upserts them.
 * First sync of a location (or opts.full) = full backfill, and removes reviews
 * no longer on Google. Later syncs stop once they reach reviews updated before
 * the last sync (ordered by updateTime desc, with a 1-day overlap).
 */
export async function syncPractice(practiceId: string, opts: { full?: boolean } = {}, db = serviceSupabase()) {
  const token = await accessTokenFor(practiceId, db)
  const { data: locations } = await db
    .from('gbp_locations').select('*').eq('practice_id', practiceId).eq('selected', true)

  const results: Array<{ location: string; fetched: number; upserted: number; removed: number; total?: number }> = []

  for (const loc of locations ?? []) {
    const full = opts.full || !loc.last_synced_at
    const since = !full ? new Date(loc.last_synced_at).getTime() - 24 * 3600 * 1000 : 0
    const rows: Record<string, unknown>[] = []
    let page: string | undefined
    let total: number | undefined
    let avg: number | undefined
    let done = false

    do {
      const qs = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' })
      if (page) qs.set('pageToken', page)
      const r = await gget<{ reviews?: GReview[]; nextPageToken?: string; totalReviewCount?: number; averageRating?: number }>(
        `https://mybusiness.googleapis.com/v4/${loc.account_name}/${loc.location_name}/reviews?${qs}`, token)
      total = r.totalReviewCount ?? total
      avg = r.averageRating ?? avg
      for (const rv of r.reviews ?? []) {
        const updated = new Date(rv.updateTime ?? rv.createTime).getTime()
        if (since && updated < since) { done = true; break }
        const stars = STARS[rv.starRating as string]
        if (!stars) continue
        rows.push({
          practice_id: practiceId,
          location_id: loc.id,
          google_review_id: rv.reviewId,
          star_rating: stars,
          comment: rv.comment ?? null,
          create_time: rv.createTime,
          update_time: rv.updateTime ?? null,
          reply_comment: rv.reviewReply?.comment ?? null,
          reply_update_time: rv.reviewReply?.updateTime ?? null,
          synced_at: new Date().toISOString(),
        })
      }
      page = r.nextPageToken
    } while (page && !done)

    let upserted = 0
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { error } = await db.from('gbp_reviews').upsert(chunk, { onConflict: 'location_id,google_review_id' })
      if (error) throw error
      upserted += chunk.length
    }

    // Full sync: remove reviews that no longer exist on Google (deleted by reviewer/Google)
    let removed = 0
    if (full) {
      const keep = new Set(rows.map(r => r.google_review_id as string))
      const { data: existing } = await db.from('gbp_reviews').select('id, google_review_id').eq('location_id', loc.id)
      const gone = (existing ?? []).filter(e => !keep.has(e.google_review_id)).map(e => e.id)
      if (gone.length) {
        await db.from('gbp_reviews').delete().in('id', gone)
        removed = gone.length
      }
    }

    await db.from('gbp_locations').update({
      last_synced_at: new Date().toISOString(),
      total_reviews: total ?? null,
      average_rating: avg ?? null,
    }).eq('id', loc.id)

    results.push({ location: loc.site_label || loc.title, fetched: rows.length, upserted, removed, total })
  }

  await db.from('gbp_connections').update({ last_error: null }).eq('practice_id', practiceId)
  return results
}
