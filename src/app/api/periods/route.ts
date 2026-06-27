import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'
import { sortPeriods } from '@/lib/data'

export async function POST() {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('practice_id, role')
      .eq('id', session.user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'No profile found' }, { status: 403 })

    const { data: rows, error } = await supabase
      .from('referrer_rows')
      .select('period, referrer, practice, specialty, suburb, referrals, income')
      .eq('practice_id', profile.practice_id)

    if (error) throw error

    const db: Record<string, typeof rows> = {}
    for (const row of rows ?? []) {
      if (!db[row.period]) db[row.period] = []
      db[row.period]!.push(row)
    }

    const periods = sortPeriods(Object.keys(db))
    return NextResponse.json({ db, periods })
  } catch (err) {
    console.error('POST /api/periods error:', err)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}