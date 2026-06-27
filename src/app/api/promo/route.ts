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

    // GET mode — fetch activities
    if (body.action === 'list') {
      const practiceId = (profile.role === 'superadmin' && body.practiceId)
        ? body.practiceId
        : profile.practice_id

      const { data, error } = await supabase
        .from('promo_activities')
        .select('*')
        .eq('practice_id', practiceId)
        .order('date', { ascending: false })

      if (error) throw error
      return NextResponse.json({ activities: data ?? [] })
    }

    // CREATE
    if (body.action === 'create') {
      if (!['superadmin', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const practiceId = (profile.role === 'superadmin' && body.practiceId)
        ? body.practiceId
        : profile.practice_id

      const { data, error } = await supabase
        .from('promo_activities')
        .insert({
          practice_id: practiceId,
          date: body.date,
          activity_type: body.activity_type,
          practice_target: body.practice_target ?? '',
          notes: body.notes ?? '',
          created_by: session.user.id,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ activity: data })
    }

    // UPDATE
    if (body.action === 'update') {
      if (!['superadmin', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { error } = await supabase
        .from('promo_activities')
        .update({
          date: body.date,
          activity_type: body.activity_type,
          practice_target: body.practice_target ?? '',
          notes: body.notes ?? '',
        })
        .eq('id', body.id)
        .eq('practice_id', profile.role === 'superadmin' && body.practiceId
          ? body.practiceId : profile.practice_id)

      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // DELETE
    if (body.action === 'delete') {
      if (!['superadmin', 'admin'].includes(profile.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { error } = await supabase
        .from('promo_activities')
        .delete()
        .eq('id', body.id)
        .eq('practice_id', profile.role === 'superadmin' && body.practiceId
          ? body.practiceId : profile.practice_id)

      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/promo error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}