import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const client = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.json()
    const period = body.period as string
    if (!period) {
      return NextResponse.json({ error: 'period required' }, { status: 400 })
    }

    await client.from('referrer_rows').delete().eq('period', period)
    await client.from('periods').delete().eq('period', period)

    return NextResponse.json({ ok: true, deleted: period })
  } catch (err) {
    console.error('delete-period error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
