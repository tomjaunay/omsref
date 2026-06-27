import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('practice_id, role')
      .eq('id', session.user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const practiceId = (profile.role === 'superadmin' && body.practiceId)
      ? body.practiceId
      : profile.practice_id

    const { data: scores, error } = await supabase
      .from('review_theme_scores')
      .select('*')
      .eq('practice_id', practiceId)
      .order('period')

    if (error) throw error

    const { data: uploads } = await supabase
      .from('review_uploads')
      .select('period, review_count, uploaded_at')
      .eq('practice_id', practiceId)
      .order('period')

    const { data: themes } = await supabase
      .from('review_themes')
      .select('code, label, description, sort_order')
      .or(`practice_id.eq.${practiceId},practice_id.is.null`)
      .eq('active', true)
      .order('sort_order')

    return NextResponse.json({
      scores: scores ?? [],
      uploads: uploads ?? [],
      themes: themes ?? [],
    })
  } catch (err) {
    console.error('POST /api/reviews/scores error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}