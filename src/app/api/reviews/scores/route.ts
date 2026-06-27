import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('practice_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const practiceId = (profile.role === 'superadmin' && body.practiceId)
      ? body.practiceId
      : profile.practice_id

    // Fetch scores
    const { data: scores, error: scoresError } = await supabase
      .from('review_theme_scores')
      .select('*')
      .eq('practice_id', practiceId)
      .order('period')
    if (scoresError) throw scoresError

    // Fetch uploads
    const { data: uploads } = await supabase
      .from('review_uploads')
      .select('period, review_count, uploaded_at, avg_rating, positive_reviews, negative_reviews, net_sentiment, summary')
      .eq('practice_id', practiceId)
      .order('period')

    // Fetch global themes separately
    const { data: globalThemes } = await supabase
      .from('review_themes')
      .select('code, label, description, sort_order, active')
      .is('practice_id', null)
      .eq('active', true)
      .order('sort_order')

    // Fetch practice-specific theme overrides
    const { data: practiceThemes } = await supabase
      .from('review_themes')
      .select('code, label, description, sort_order, active')
      .eq('practice_id', practiceId)
      .order('sort_order')

    // Merge: practice overrides take precedence over globals
    const practiceMap = new Map((practiceThemes ?? []).map(t => [t.code, t]))
    const merged = [
      ...(globalThemes ?? []).filter(g => !practiceMap.has(g.code)),
      ...(practiceThemes ?? []),
    ].filter(t => t.active).sort((a, b) => a.sort_order - b.sort_order)

    return NextResponse.json({
      scores: scores ?? [],
      uploads: uploads ?? [],
      themes: merged,
    })
  } catch (err) {
    console.error('POST /api/reviews/scores error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}