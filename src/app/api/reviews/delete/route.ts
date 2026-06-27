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

    if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { period, practiceId } = await req.json()
    const targetPracticeId = (profile.role === 'superadmin' && practiceId)
      ? practiceId
      : profile.practice_id

    await supabase.from('review_theme_scores').delete()
      .eq('practice_id', targetPracticeId).eq('period', period)
    await supabase.from('review_uploads').delete()
      .eq('practice_id', targetPracticeId).eq('period', period)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}