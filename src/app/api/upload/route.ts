import { NextRequest, NextResponse } from 'next/server'
import { upsertPeriod } from '@/lib/supabase'
import { parseGentuCSV } from '@/lib/data'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { period: string; csvText: string }
    const { period, csvText } = body

    if (!period || !/^\d{4}Q[1-4]$/.test(period)) {
      return NextResponse.json({ error: 'Invalid period format' }, { status: 400 })
    }
    if (!csvText) {
      return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 })
    }

    const rows = parseGentuCSV(csvText)
    if (!rows) {
      return NextResponse.json(
        { error: 'Could not parse CSV — make sure it is the Referrer Details export from Gentu' },
        { status: 422 }
      )
    }

    await upsertPeriod(period, rows)

    const totalRefs = rows.reduce((s, r) => s + r.referrals, 0)
    const totalIncome = rows.reduce((s, r) => s + r.income, 0)

    return NextResponse.json(
  { ok: true, period, referrers: rows.length, referrals: totalRefs, income: totalIncome },
  { headers: { 'Cache-Control': 'no-store' } }
)
  } catch (err) {
    console.error('POST /api/upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
