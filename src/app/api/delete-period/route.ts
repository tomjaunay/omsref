import { NextRequest, NextResponse } from 'next/server'
import { deletePeriod } from '@/lib/supabase'

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period')
    if (!period) return NextResponse.json({ error: 'period required' }, { status: 400 })
    await deletePeriod(period)
    return NextResponse.json({ ok: true, deleted: period })
  } catch (err) {
    console.error('DELETE /api/periods error:', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
