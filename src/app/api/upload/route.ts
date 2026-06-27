import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'
import { parseGentuCSV } from '@/lib/data'

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

    const body = await req.json() as { period: string; csvText: string; practiceId?: string }
    const { period, csvText } = body

    // Superadmin can upload for any practice via practiceId override
    const practiceId = (profile.role === 'superadmin' && body.practiceId)
      ? body.practiceId
      : profile.practice_id

    if (!period || !/^\d{4}Q[1-4]$/.test(period)) {
      return NextResponse.json({ error: 'Invalid period format' }, { status: 400 })
    }

    const rows = parseGentuCSV(csvText)
    if (!rows) {
      return NextResponse.json({ error: 'Could not parse CSV' }, { status: 422 })
    }

    // Delete existing rows for this period + practice
    await supabase
      .from('referrer_rows')
      .delete()
      .eq('practice_id', practiceId)
      .eq('period', period)

    // Upsert period record
    await supabase
      .from('periods')
      .upsert({ practice_id: practiceId, period, uploaded_by: session.user.id }, {
        onConflict: 'practice_id,period'
      })

    // Insert rows in batches
    const fullRows = rows.map(r => ({ ...r, practice_id: practiceId, period }))
    for (let i = 0; i < fullRows.length; i += 200) {
      const { error } = await supabase.from('referrer_rows').insert(fullRows.slice(i, i + 200))
      if (error) throw error
    }

    return NextResponse.json({
      ok: true, period,
      referrers: rows.length,
      referrals: rows.reduce((s, r) => s + r.referrals, 0),
      income: rows.reduce((s, r) => s + r.income, 0),
    })
  } catch (err) {
    console.error('POST /api/upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}