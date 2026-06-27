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

    const body = await req.json()
    const targetPracticeId = (profile.role === 'superadmin' && body.practiceId)
      ? body.practiceId
      : profile.practice_id

    // LIST — fetch merged codebook (globals + practice overrides)
    if (body.action === 'list') {
      const { data: globalThemes } = await supabase
        .from('review_themes')
        .select('*')
        .is('practice_id', null)
        .order('sort_order')

      const { data: practiceThemes } = await supabase
        .from('review_themes')
        .select('*')
        .eq('practice_id', targetPracticeId)
        .order('sort_order')

      return NextResponse.json({
        globalThemes: globalThemes ?? [],
        practiceThemes: practiceThemes ?? [],
      })
    }

    // Only admins can modify
    if (!['superadmin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // CREATE — add a practice-specific theme
    if (body.action === 'create') {
      const { data, error } = await supabase
        .from('review_themes')
        .insert({
          practice_id: targetPracticeId,
          code: body.code,
          label: body.label,
          description: body.description,
          sort_order: body.sort_order ?? 99,
          active: true,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ theme: data })
    }

    // UPDATE — update a theme (must belong to this practice)
    if (body.action === 'update') {
      const { error } = await supabase
        .from('review_themes')
        .update({
          label: body.label,
          description: body.description,
          sort_order: body.sort_order,
          active: body.active,
        })
        .eq('id', body.id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // TOGGLE — enable/disable a global theme for this practice
    // Creates a practice-level override record
    if (body.action === 'toggle') {
      const { data: existing } = await supabase
        .from('review_themes')
        .select('id')
        .eq('practice_id', targetPracticeId)
        .eq('code', body.code)
        .single()

      if (existing) {
        await supabase.from('review_themes')
          .update({ active: body.active })
          .eq('id', existing.id)
      } else {
        await supabase.from('review_themes').insert({
          practice_id: targetPracticeId,
          code: body.code,
          label: body.label,
          description: body.description,
          sort_order: body.sort_order ?? 99,
          active: body.active,
        })
      }
      return NextResponse.json({ ok: true })
    }

    // DELETE — remove a practice-specific theme
    if (body.action === 'delete') {
      const { error } = await supabase
        .from('review_themes')
        .delete()
        .eq('id', body.id)
        .eq('practice_id', targetPracticeId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/reviews/codebook error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}