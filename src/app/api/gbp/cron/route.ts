import { NextRequest, NextResponse } from 'next/server'
import { serviceSupabase, syncPractice } from '@/lib/gbp'
import { draftPending, loadSettings } from '@/lib/replies'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Weekly Vercel cron (see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = serviceSupabase()
  const { data: conns } = await db.from('gbp_connections').select('practice_id')
  const out: Record<string, unknown> = {}
  for (const c of conns ?? []) {
    try {
      const synced = await syncPractice(c.practice_id, {}, db)
      // Draft replies for new unreplied reviews (approval still required before anything is posted)
      const settings = await loadSettings(c.practice_id, db)
      const drafts = settings.auto_draft ? await draftPending(c.practice_id, { limit: 8 }, db) : null
      out[c.practice_id] = { synced, drafts }
    } catch (e) {
      out[c.practice_id] = { error: (e as Error).message }
      await db.from('gbp_connections').update({ last_error: (e as Error).message.slice(0, 500) }).eq('practice_id', c.practice_id)
    }
  }
  console.log('gbp cron', JSON.stringify(out))
  return NextResponse.json({ ok: true, results: out })
}
