import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

function dateToQuarter(dateStr: string): string {
  const d = new Date(dateStr)
  const q = Math.ceil((d.getMonth() + 1) / 3)
  return `${d.getFullYear()}Q${q}`
}

function addQuarters(qStr: string, n: number): string {
  const match = qStr.match(/^(\d{4})Q([1-4])$/)
  if (!match) return qStr
  let year = parseInt(match[1])
  let q = parseInt(match[2]) + n
  while (q > 4) { q -= 4; year++ }
  while (q < 1) { q += 4; year-- }
  return `${year}Q${q}`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('practice_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const targetPracticeId = (profile.role === 'superadmin' && body.practiceId)
      ? body.practiceId
      : profile.practice_id

    // Fetch all promo events
    const { data: events } = await supabase
      .from('promo_activities')
      .select('id, date, activity_type, practice_target, notes')
      .eq('practice_id', targetPracticeId)
      .order('date', { ascending: false })

    // Fetch all referral rows
    const { data: referralRows } = await supabase
      .from('referrer_rows')
      .select('period, practice, referrals, income')
      .eq('practice_id', targetPracticeId)

    // Build referral lookup: practice name → period → { refs, income }
    const refLookup: Record<string, Record<string, { refs: number; income: number }>> = {}
    for (const r of referralRows ?? []) {
      const key = r.practice.toLowerCase().trim()
      if (!refLookup[key]) refLookup[key] = {}
      if (!refLookup[key][r.period]) refLookup[key][r.period] = { refs: 0, income: 0 }
      refLookup[key][r.period].refs += r.referrals
      refLookup[key][r.period].income += r.income
    }

    // For each event, find matching practice and compute lag response
    const attribution = (events ?? []).map(event => {
      const eventQuarter = dateToQuarter(event.date)
      const q1 = addQuarters(eventQuarter, 1)
      const q2 = addQuarters(eventQuarter, 2)

      // Fuzzy match practice name
      const targetLower = event.practice_target.toLowerCase().trim()
      const matchKey = Object.keys(refLookup).find(k =>
        k.includes(targetLower) || targetLower.includes(k) || k === targetLower
      )

      const practiceData = matchKey ? refLookup[matchKey] : null

      const refsAtEvent = practiceData?.[eventQuarter]?.refs ?? null
      const refsQ1 = practiceData?.[q1]?.refs ?? null
      const refsQ2 = practiceData?.[q2]?.refs ?? null

      // Determine response
      let response: 'responded' | 'lagged' | 'flat' | 'declined' | 'no_data' = 'no_data'
      if (practiceData && (refsQ1 !== null || refsQ2 !== null)) {
        const baseline = refsAtEvent ?? 0
        const peak = Math.max(refsQ1 ?? 0, refsQ2 ?? 0)
        const pctChange = baseline > 0 ? ((peak - baseline) / baseline) * 100 : 0

        if (pctChange > 20) {
          response = refsQ1 !== null && refsQ1 > baseline ? 'responded' : 'lagged'
        } else if (pctChange < -20) {
          response = 'declined'
        } else {
          response = 'flat'
        }
      }

      return {
        id: event.id,
        date: event.date,
        quarter: eventQuarter,
        activity_type: event.activity_type,
        practice_target: event.practice_target,
        notes: event.notes,
        matched: !!matchKey,
        refsAtEvent,
        refsQ1,
        refsQ2,
        q1Label: q1,
        q2Label: q2,
        response,
      }
    })

    // Summary stats
    const matched = attribution.filter(a => a.matched)
    const responded = matched.filter(a => a.response === 'responded' || a.response === 'lagged')
    const responseRate = matched.length > 0
      ? Math.round((responded.length / matched.length) * 100)
      : 0

    return NextResponse.json({
      attribution,
      summary: {
        totalEvents: attribution.length,
        matchedPractices: matched.length,
        responded: responded.length,
        responseRate,
      },
    })
  } catch (err) {
    console.error('POST /api/promo/attribution error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}