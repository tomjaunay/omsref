import { NextRequest, NextResponse } from 'next/server'
import { accessTokenFor, listGoogleLocations, requirePracticeAdmin, requirePracticeViewer, serviceSupabase } from '@/lib/gbp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { action: 'list' | 'refresh' | 'update' | 'disconnect', practiceId?, updates? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action ?? 'list'

    if (action === 'list') {
      const auth = await requirePracticeViewer(body.practiceId)
      if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
      const db = serviceSupabase()
      const [{ data: conn }, { data: locations }] = await Promise.all([
        db.from('gbp_connections').select('google_email, connected_at, last_error').eq('practice_id', auth.practiceId).maybeSingle(),
        db.from('gbp_locations')
          .select('id, title, address, site_label, selected, total_reviews, average_rating, last_synced_at')
          .eq('practice_id', auth.practiceId).order('title'),
      ])
      return NextResponse.json({ connection: conn ?? null, locations: locations ?? [] })
    }

    const auth = await requirePracticeAdmin(body.practiceId)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const db = serviceSupabase()

    if (action === 'refresh') {
      const token = await accessTokenFor(auth.practiceId, db)
      const locations = await listGoogleLocations(token)
      if (locations.length) {
        await db.from('gbp_locations').upsert(
          locations.map(l => ({ ...l, practice_id: auth.practiceId })),
          { onConflict: 'practice_id,location_name', ignoreDuplicates: true },
        )
      }
      return NextResponse.json({ ok: true, found: locations.length })
    }

    if (action === 'update') {
      const updates = (body.updates ?? []) as Array<{ id: string; selected?: boolean; site_label?: string | null }>
      for (const u of updates) {
        const patch: Record<string, unknown> = {}
        if (typeof u.selected === 'boolean') patch.selected = u.selected
        if (u.site_label !== undefined) patch.site_label = u.site_label?.trim() || null
        if (!Object.keys(patch).length) continue
        const { error } = await db.from('gbp_locations').update(patch)
          .eq('id', u.id).eq('practice_id', auth.practiceId)
        if (error) throw error
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'disconnect') {
      // Removes the stored token only; synced reviews and analyses are kept.
      await db.from('gbp_connections').delete().eq('practice_id', auth.practiceId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/gbp/locations error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
