import { NextRequest, NextResponse } from 'next/server'
import { requirePracticeViewer, serviceSupabase } from '@/lib/gbp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BucketRow {
  quarter: string
  location_id: string
  title: string
  site_label: string | null
  selected: boolean
  review_count: number
  with_text: number
  avg_rating: number | null
  positive_ratings: number
  negative_ratings: number
  unreplied: number
}

// POST { practiceId? } → quarterly buckets per source profile, plus a combined
// 'all' row per quarter (selected profiles only) and analysis status per scope.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const auth = await requirePracticeViewer(body.practiceId)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const db = serviceSupabase()

    const [{ data: rows, error }, { data: uploads }] = await Promise.all([
      db.from('gbp_review_buckets').select('*').eq('practice_id', auth.practiceId).order('quarter'),
      db.from('review_uploads').select('period, scope, source, review_count, uploaded_at').eq('practice_id', auth.practiceId),
    ])
    if (error) throw error

    const byQuarter = new Map<string, { quarter: string; all: Omit<BucketRow, 'quarter' | 'location_id' | 'title' | 'site_label' | 'selected'>; sources: BucketRow[] }>()
    for (const r of (rows ?? []) as BucketRow[]) {
      if (!byQuarter.has(r.quarter)) {
        byQuarter.set(r.quarter, { quarter: r.quarter, all: { review_count: 0, with_text: 0, avg_rating: null, positive_ratings: 0, negative_ratings: 0, unreplied: 0 }, sources: [] })
      }
      const b = byQuarter.get(r.quarter)!
      b.sources.push(r)
      if (!r.selected) continue
      const a = b.all
      const prevTotal = (a.avg_rating ?? 0) * a.review_count
      a.review_count += Number(r.review_count)
      a.with_text += Number(r.with_text)
      a.positive_ratings += Number(r.positive_ratings)
      a.negative_ratings += Number(r.negative_ratings)
      a.unreplied += Number(r.unreplied)
      a.avg_rating = a.review_count ? Math.round(((prevTotal + Number(r.avg_rating) * Number(r.review_count)) / a.review_count) * 100) / 100 : null
    }

    const analysed = new Map((uploads ?? []).map(u => [`${u.period}|${u.scope ?? 'all'}`, u]))
    const buckets = [...byQuarter.values()]
      .sort((a, b) => b.quarter.localeCompare(a.quarter))
      .map(b => ({
        ...b,
        analysis: analysed.get(`${b.quarter}|all`) ?? null,
        sources: b.sources.map(s => ({ ...s, analysis: analysed.get(`${b.quarter}|${s.location_id}`) ?? null })),
      }))

    return NextResponse.json({ buckets })
  } catch (err) {
    console.error('POST /api/gbp/buckets error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
