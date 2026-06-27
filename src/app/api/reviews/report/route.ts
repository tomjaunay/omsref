export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

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

    const body = await req.json()
    const { periods, practiceId } = body as { periods: string[]; practiceId?: string }

    const targetPracticeId = (profile.role === 'superadmin' && practiceId)
      ? practiceId
      : profile.practice_id

    const { data: practice } = await supabase
      .from('practices').select('name').eq('id', targetPracticeId).single()

    const { data: uploads } = await supabase
      .from('review_uploads')
      .select('period, review_count, avg_rating, positive_reviews, negative_reviews, net_sentiment, summary')
      .eq('practice_id', targetPracticeId)
      .in('period', periods)
      .order('period')

    const { data: scores } = await supabase
      .from('review_theme_scores')
      .select('period, theme_code, positive_count, negative_count, net_sentiment, representative_quote')
      .eq('practice_id', targetPracticeId)
      .in('period', periods)
      .order('period')

    const { data: globalThemes } = await supabase
      .from('review_themes')
      .select('code, label, sort_order')
      .is('practice_id', null)
      .eq('active', true)
      .order('sort_order')

    const { data: practiceThemes } = await supabase
      .from('review_themes')
      .select('code, label, sort_order')
      .eq('practice_id', targetPracticeId)
      .order('sort_order')

    const practiceMap = new Map((practiceThemes ?? []).map(t => [t.code, t]))
    const themes = [
      ...(globalThemes ?? []).filter(g => !practiceMap.has(g.code)),
      ...(practiceThemes ?? []),
    ].sort((a, b) => a.sort_order - b.sort_order)

    const sortedPeriods = [...periods].sort()
    const latestPeriod = sortedPeriods[sortedPeriods.length - 1]
    const latestUpload = uploads?.find(u => u.period === latestPeriod)
    const practiceName = practice?.name ?? 'Practice'
    const generatedDate = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

    function netColor(net: number): string {
      if (net > 5)  return '#1a7a35'
      if (net > 0)  return '#6aaa6a'
      if (net === 0) return '#c89a00'
      if (net > -5) return '#d4732a'
      return '#b33030'
    }

    function getScore(themeCode: string, period: string) {
      return scores?.find(s => s.theme_code === themeCode && s.period === period)
    }

    function getUpload(period: string) {
      return uploads?.find(u => u.period === period)
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 11px; color: #1a1a18; background: white; }
  .page { padding: 32px 36px; max-width: 900px; margin: 0 auto; }
  .header { border-bottom: 2px solid #1a6b3c; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header-left h1 { font-size: 20px; font-weight: 700; color: #1a1a18; }
  .header-left h2 { font-size: 13px; font-weight: 500; color: #7a7870; margin-top: 3px; }
  .header-right { font-size: 10px; color: #7a7870; text-align: right; }
  .section-title { font-size: 11px; font-weight: 600; color: #1a1a18; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 28px; }
  th { padding: 6px 8px; text-align: left; color: #7a7870; font-weight: 500; font-size: 9px; border-bottom: 1.5px solid #e2e0db; white-space: nowrap; background: #f7f6f3; }
  th.num { text-align: center; }
  td { padding: 8px 8px; border-bottom: 1px solid #ebe9e4; vertical-align: top; }
  td.num { text-align: center; font-weight: 600; font-size: 12px; }
  td.quote { font-style: italic; color: #7a7870; font-size: 9px; max-width: 140px; line-height: 1.4; }
  .theme-label { font-weight: 500; font-size: 10px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e0db; font-size: 9px; color: #7a7870; display: flex; justify-content: space-between; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px 24px; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <h1>${practiceName}</h1>
      <h2>Google Reviews — Thematic Analysis Report</h2>
    </div>
    <div class="header-right">
      Generated ${generatedDate}<br>
      Trend periods: ${sortedPeriods.join(', ')}
    </div>
  </div>

  <!-- Latest quarter summary -->
  <div class="section-title">Latest Quarter Summary — ${latestPeriod}</div>
  <div style="border: 1px solid #e2e0db; border-radius: 8px; padding: 20px 24px; margin-bottom: 28px; border-left: 4px solid ${netColor(latestUpload?.net_sentiment ?? 0)}; display: flex; gap: 32px; align-items: flex-start;">
    <div style="flex-shrink: 0;">
      <div style="font-size: 36px; font-weight: 700; color: ${netColor(latestUpload?.net_sentiment ?? 0)}; line-height: 1;">${(latestUpload?.net_sentiment ?? 0) > 0 ? '+' : ''}${latestUpload?.net_sentiment ?? 0}</div>
      <div style="font-size: 11px; color: #7a7870; margin-top: 4px;">net sentiment</div>
      <div style="margin-top: 12px; display: flex; gap: 16px;">
        ${latestUpload?.avg_rating != null ? `<div><div style="font-size: 14px; font-weight: 600;">${latestUpload.avg_rating}★</div><div style="font-size: 9px; color: #7a7870;">avg rating</div></div>` : ''}
        <div><div style="font-size: 14px; font-weight: 600;">${latestUpload?.review_count ?? 0}</div><div style="font-size: 9px; color: #7a7870;">reviews</div></div>
        ${(latestUpload?.positive_reviews ?? 0) > 0 ? `<div><div style="font-size: 14px; font-weight: 600; color: #1a7a35;">+${latestUpload?.positive_reviews}</div><div style="font-size: 9px; color: #7a7870;">positive</div></div>` : ''}
        ${(latestUpload?.negative_reviews ?? 0) > 0 ? `<div><div style="font-size: 14px; font-weight: 600; color: #b33030;">−${latestUpload?.negative_reviews}</div><div style="font-size: 9px; color: #7a7870;">negative</div></div>` : ''}
      </div>
    </div>
    ${latestUpload?.summary ? `
    <div style="flex: 1; font-size: 12px; color: #444; line-height: 1.8; font-style: italic; border-left: 2px solid #e2e0db; padding-left: 24px; margin-left: 8px;">
      ${latestUpload.summary}
    </div>` : ''}
  </div>

  <!-- Theme scores table — all selected periods -->
  <div class="section-title">Theme Scores Across Selected Periods</div>
  <table>
    <thead>
      <tr>
        <th style="min-width: 120px;">Theme</th>
        ${sortedPeriods.map(p => {
          const u = getUpload(p)
          return `<th class="num">${p}${u ? `<br><span style="font-weight:400;font-size:8px;">${u.review_count} reviews</span>` : ''}</th>`
        }).join('')}
        <th>Representative quote</th>
      </tr>
    </thead>
    <tbody>
      ${themes.map(theme => {
        const bestQuote = sortedPeriods
          .map(p => getScore(theme.code, p)?.representative_quote)
          .filter(Boolean)[0] ?? null
        return `<tr>
          <td class="theme-label">${theme.label}</td>
          ${sortedPeriods.map(p => {
            const score = getScore(theme.code, p)
            if (!score) return `<td class="num" style="color:#ccc;">—</td>`
            const net = score.net_sentiment
            return `<td class="num" style="color:${netColor(net)}">${net > 0 ? '+' : ''}${net}</td>`
          }).join('')}
          <td class="quote">${bestQuote ? `"${bestQuote}"` : '—'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <!-- Trend highlights -->
  <div class="section-title">Trend Highlights</div>
  <div style="font-size: 10px; line-height: 2; color: #1a1a18; margin-bottom: 28px;">
    ${themes.map(theme => {
      const vals = sortedPeriods.map(p => getScore(theme.code, p)?.net_sentiment ?? 0)
      const nonZero = vals.filter(v => v !== 0)
      if (nonZero.length < 2) return ''
      const first = nonZero[0]
      const last = nonZero[nonZero.length - 1]
      const diff = last - first
      if (Math.abs(diff) < 2) return ''
      const direction = diff > 0 ? '▲ improving' : '▼ declining'
      const color = diff > 0 ? '#1a7a35' : '#b33030'
      return `<span style="display:inline-block; margin-right:24px; margin-bottom:4px;">
        <strong>${theme.label}:</strong> <span style="color:${color}">${direction}</span> (${first > 0 ? '+' : ''}${first} → ${last > 0 ? '+' : ''}${last})
      </span>`
    }).filter(Boolean).join('')}
  </div>

  <div class="footer">
    <span>${practiceName} · Confidential</span>
    <span>OMFS Referral Analytics · Generated ${generatedDate}</span>
  </div>
</div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    console.error('POST /api/reviews/report error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}