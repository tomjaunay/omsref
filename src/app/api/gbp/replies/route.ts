import { NextRequest, NextResponse } from 'next/server'
import { requirePracticeAdmin, requirePracticeViewer, serviceSupabase } from '@/lib/gbp'
import {
  checkReply, draftPending, histEntry, loadSettings, postReplyToGoogle, siteNamesFor, DEFAULT_SETTINGS,
} from '@/lib/replies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Hist = ReturnType<typeof histEntry>

/*
 POST body { action, practiceId?, ... }
  list      { status?: 'pending'|'posted'|'skipped'|'failed' }
  settings  {}                                → current reply settings
  save_settings { settings }
  draft     {}                                → draft new unreplied reviews (batch of 15)
  redraft   { reviewId }
  check     { reviewId, text }                → run the compliance checker on edited text
  post      { draftId, text }                 → re-check, then publish to Google
  skip      { draftId, note? }
  reopen    { draftId }
*/
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const action: string = body.action ?? 'list'
    const db = serviceSupabase()

    if (action === 'list' || action === 'settings') {
      const auth = await requirePracticeViewer(body.practiceId)
      if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
      if (action === 'settings') return NextResponse.json({ settings: await loadSettings(auth.practiceId, db) })

      const status = ['pending', 'posted', 'skipped', 'failed'].includes(body.status) ? body.status : 'pending'
      const { data, error } = await db.from('gbp_reply_drafts')
        .select(`id, review_id, category, draft_text, model_text, used_template, check_flags, status, final_text,
                 decided_at, posted_at, error, history, updated_at,
                 gbp_reviews!inner(star_rating, comment, create_time, reply_comment, location_id,
                   gbp_locations!inner(title, site_label))`)
        .eq('practice_id', auth.practiceId).eq('status', status)
        .order('updated_at', { ascending: false }).limit(200)
      if (error) throw error

      // How many unreplied reviews in the window still have no draft
      const s = await loadSettings(auth.practiceId, db)
      const since = new Date(Date.now() - s.draft_window_days * 86400000).toISOString()
      const { data: locs } = await db.from('gbp_locations').select('id').eq('practice_id', auth.practiceId).eq('selected', true)
      let undrafted = 0
      if (locs?.length) {
        const { data: cand } = await db.from('gbp_reviews').select('id')
          .eq('practice_id', auth.practiceId).in('location_id', locs.map(l => l.id))
          .is('reply_comment', null).gte('create_time', since)
        const ids = (cand ?? []).map(c => c.id)
        if (ids.length) {
          const { data: have } = await db.from('gbp_reply_drafts').select('review_id').in('review_id', ids)
          undrafted = ids.length - (have?.length ?? 0)
        }
      }
      return NextResponse.json({ drafts: data ?? [], undrafted, windowDays: s.draft_window_days })
    }

    const auth = await requirePracticeAdmin(body.practiceId)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const userId = auth.user.id

    if (action === 'save_settings') {
      const inSet = body.settings ?? {}
      const list = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/))
        .map(x => String(x).trim()).filter(Boolean)
      const row = {
        practice_id: auth.practiceId,
        contact_phone: String(inSet.contact_phone ?? '').trim() || null,
        contact_email: String(inSet.contact_email ?? '').trim() || null,
        contact_role: String(inSet.contact_role ?? '').trim() || DEFAULT_SETTINGS.contact_role,
        signoff: String(inSet.signoff ?? '').trim() || DEFAULT_SETTINGS.signoff,
        clinician_names: list(inSet.clinician_names),
        blocked_terms: list(inSet.blocked_terms),
        draft_window_days: Math.min(730, Math.max(7, Number(inSet.draft_window_days) || DEFAULT_SETTINGS.draft_window_days)),
        auto_draft: inSet.auto_draft !== false,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }
      const { error } = await db.from('gbp_reply_settings').upsert(row, { onConflict: 'practice_id' })
      if (error) throw error
      return NextResponse.json({ ok: true, settings: await loadSettings(auth.practiceId, db) })
    }

    if (action === 'draft') {
      const r = await draftPending(auth.practiceId, { limit: 15 }, db)
      return NextResponse.json({ ok: true, ...r })
    }

    if (action === 'redraft') {
      const r = await draftPending(auth.practiceId, { reviewIds: [body.reviewId], limit: 1 }, db)
      return NextResponse.json({ ok: true, ...r })
    }

    if (action === 'check') {
      const { data: rv } = await db.from('gbp_reviews').select('comment').eq('id', body.reviewId).eq('practice_id', auth.practiceId).single()
      const s = await loadSettings(auth.practiceId, db)
      const flags = checkReply(String(body.text ?? ''), { reviewText: rv?.comment, siteNames: await siteNamesFor(auth.practiceId, db), settings: s })
      return NextResponse.json({ flags })
    }

    // Actions on an existing draft
    const { data: d } = await db.from('gbp_reply_drafts')
      .select('id, review_id, status, history, gbp_reviews!inner(comment, reply_comment)')
      .eq('id', body.draftId).eq('practice_id', auth.practiceId).single()
    if (!d) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
    const history = (d.history as Hist[]) ?? []

    if (action === 'skip' || action === 'reopen') {
      const status = action === 'skip' ? 'skipped' : 'pending'
      await db.from('gbp_reply_drafts').update({
        status, decided_by: action === 'skip' ? userId : null, decided_at: action === 'skip' ? new Date().toISOString() : null,
        history: [...history, histEntry(action === 'skip' ? 'skipped' : 'reopened', userId, body.note)],
        updated_at: new Date().toISOString(),
      }).eq('id', d.id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'post') {
      if (d.status === 'posted') return NextResponse.json({ error: 'Already posted' }, { status: 409 })
      const text = String(body.text ?? '').trim()
      if (!text) return NextResponse.json({ error: 'Reply is empty' }, { status: 400 })
      const review = d.gbp_reviews as unknown as { comment: string | null; reply_comment: string | null }
      const s = await loadSettings(auth.practiceId, db)
      const flags = checkReply(text, { reviewText: review.comment, siteNames: await siteNamesFor(auth.practiceId, db), settings: s })
      if (flags.length) {
        // Hard stop — edit the text and try again
        return NextResponse.json({ error: 'Reply failed the compliance check', flags }, { status: 422 })
      }
      try {
        await postReplyToGoogle(auth.practiceId, d.review_id, text, db)
      } catch (e) {
        await db.from('gbp_reply_drafts').update({
          status: 'failed', error: (e as Error).message.slice(0, 500), final_text: text,
          history: [...history, histEntry('post failed', userId, (e as Error).message.slice(0, 200))],
          updated_at: new Date().toISOString(),
        }).eq('id', d.id)
        throw e
      }
      const now = new Date().toISOString()
      await db.from('gbp_reply_drafts').update({
        status: 'posted', final_text: text, decided_by: userId, decided_at: now, posted_at: now, error: null,
        history: [...history, histEntry(review.reply_comment ? 'posted (replaced existing reply)' : 'posted', userId)],
        updated_at: now,
      }).eq('id', d.id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/gbp/replies error:', err)
    return NextResponse.json({ error: String((err as Error).message ?? err) }, { status: 500 })
  }
}
