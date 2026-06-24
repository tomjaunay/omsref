import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sortPeriods } from '@/lib/data'

export async function GET() {
  try {
    const { data: rows, error } = await supabase
      .from('referrer_rows')
      .select('period, referrer, practice, specialty, suburb, referrals, income')

    if (error) {
      console.error('Supabase query error:', error)
      throw error
    }

    console.log(`Fetched ${rows?.length ?? 0} rows from referrer_rows`)

    // Group by period
    const db: Record<string, typeof rows> = {}
    for (const row of rows ?? []) {
      if (!db[row.period]) db[row.period] = []
      db[row.period]!.push(row)
    }

    const periods = sortPeriods(Object.keys(db))
    console.log('Periods found:', periods)

    return NextResponse.json({ db, periods })
  } catch (err) {
    console.error('GET /api/periods error:', err)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}