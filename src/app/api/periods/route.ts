import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sortPeriods } from '@/lib/data'

export async function GET() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  console.log('Supabase URL:', url ? url.slice(0, 30) + '...' : 'MISSING')
  console.log('Supabase key:', key ? 'SET (' + key.slice(0, 10) + '...)' : 'MISSING')

  try {
    const client = createClient(url, key)
    const { data: rows, error } = await client
      .from('referrer_rows')
      .select('period, referrer, practice, specialty, suburb, referrals, income')

    console.log('Query result - rows:', rows?.length ?? 0, 'error:', error)

    if (error) throw error

    const db: Record<string, typeof rows> = {}
    for (const row of rows ?? []) {
      if (!db[row.period]) db[row.period] = []
      db[row.period]!.push(row)
    }

    const periods = sortPeriods(Object.keys(db))
    console.log('Periods:', periods)

    return NextResponse.json(
      { db, periods },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    console.error('GET /api/periods error:', err)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}