import { NextRequest, NextResponse } from 'next/server'
import { requirePracticeAdmin, syncPractice } from '@/lib/gbp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST { practiceId?, full? } — manual "Sync now" from the Sources view
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const auth = await requirePracticeAdmin(body.practiceId)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const results = await syncPractice(auth.practiceId, { full: !!body.full })
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('POST /api/gbp/sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
