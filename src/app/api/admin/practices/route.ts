import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

export async function GET() {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', session.user.id).single()

    if (profile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: practices } = await supabase
      .from('practices').select('*').order('name')

    // Get user counts and period counts per practice
    const { data: userCounts } = await supabase
      .from('user_profiles').select('practice_id')

    const { data: periodCounts } = await supabase
      .from('periods').select('practice_id, period')

    const summary = (practices ?? []).map(p => ({
      ...p,
      userCount: (userCounts ?? []).filter(u => u.practice_id === p.id).length,
      periodCount: (periodCounts ?? []).filter(pc => pc.practice_id === p.id).length,
    }))

    return NextResponse.json({ practices: summary })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles').select('role').eq('id', session.user.id).single()

    if (profile?.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, slug } = await req.json()
    if (!name || !slug) return NextResponse.json({ error: 'name and slug required' }, { status: 400 })

    const { data, error } = await supabase
      .from('practices').insert({ name, slug }).select().single()

    if (error) throw error
    return NextResponse.json({ practice: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}