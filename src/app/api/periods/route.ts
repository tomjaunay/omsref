import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sortPeriods } from '@/lib/data'

export async function POST() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  try {
    const client = createClient(url, key)
    const { data: rows, error } = await client
      .from('referrer_rows')
      .select('period, referrer, practice, specialty, suburb, referrals, income')

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