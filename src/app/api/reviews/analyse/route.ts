import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

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

    if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { reviews, period, practiceId } = body as {
      reviews: Array<{ text: string; rating: number; date: string }>
      period: string
      practiceId?: string
    }

    const targetPracticeId = (profile.role === 'superadmin' && practiceId)
      ? practiceId
      : profile.practice_id

    // Fetch global themes
    const { data: globalThemes } = await supabase
      .from('review_themes')
      .select('code, label, description, sort_order, active')
      .is('practice_id', null)
      .eq('active', true)
      .order('sort_order')

    // Fetch practice-specific theme overrides
    const { data: practiceThemes } = await supabase
      .from('review_themes')
      .select('code, label, description, sort_order, active')
      .eq('practice_id', targetPracticeId)
      .order('sort_order')

    // Merge: practice overrides take precedence over globals
    const practiceMap = new Map((practiceThemes ?? []).map(t => [t.code, t]))
    const merged = [
      ...(globalThemes ?? []).filter(g => !practiceMap.has(g.code)),
      ...(practiceThemes ?? []),
    ].filter(t => t.active).sort((a, b) => a.sort_order - b.sort_order)

    const themes = merged.length > 0 ? merged : [
      { code: 'clinical_quality',  label: 'Clinical quality',          description: 'Comments about surgical skill, outcomes, results, expertise' },
      { code: 'pain_anxiety',      label: 'Pain & anxiety management', description: 'Mentions of comfort, fear, sedation, gentleness, patient care during procedure' },
      { code: 'communication',     label: 'Communication',             description: 'Explanation of treatment, informed consent, responsiveness, clarity of information' },
      { code: 'wait_times',        label: 'Wait times',                description: 'Appointment availability, punctuality, delays, booking process' },
      { code: 'staff_manner',      label: 'Staff manner',              description: 'Friendliness, professionalism, empathy of non-clinical staff' },
      { code: 'value_cost',        label: 'Value & cost',              description: 'Pricing comments, Medicare, health fund, billing, fee transparency' },
      { code: 'facility',          label: 'Facility',                  description: 'Cleanliness, equipment, environment, parking, accessibility' },
      { code: 'rescue_complex',    label: 'Rescue / complex case',     description: 'Patient describing being referred after problems elsewhere, complex or difficult case' },
      { code: 'outcome_followup',  label: 'Outcome & follow-up',       description: 'Post-operative care, recovery support, long-term result satisfaction' },
    ]

    const systemPrompt = `You are a qualitative analyst coding patient reviews for an Oral & Maxillofacial Surgery specialist practice in Sydney, Australia.
You will be given patient Google reviews and a codebook of themes.
Your task is to code each review rigorously against the codebook and return structured JSON.
Be conservative — only count a theme if it is meaningfully present, not just implied.
Respond ONLY with valid JSON. No markdown, no explanation, no preamble.`

    const userPrompt = `CODEBOOK:
${themes.map(t => `- ${t.code}: ${t.label} — ${t.description}`).join('\n')}

REVIEWS (${reviews.length} total for ${period}):
${reviews.map((r, i) => `[${i + 1}] Rating: ${r.rating}/5 | Date: ${r.date}
${r.text}`).join('\n\n')}

INSTRUCTIONS:
For each theme in the codebook:
1. Count reviews where this theme is a PRIMARY focus, not just a passing mention
2. Classify each mention:
   - positive: clearly good experience with this aspect
   - negative: clearly bad experience with this aspect
   - neutral: mentioned but not evaluative
3. net_sentiment = positive_count minus negative_count
4. representative_quote: most vivid verbatim quote under 20 words, or null if no meaningful mentions
5. If a theme has no meaningful mentions across all reviews, set all counts to 0

For overall metrics:
- avg_rating: mean star rating to 1 decimal place
- positive_reviews: reviews that are predominantly positive (rating 4-5 AND positive language)
- negative_reviews: reviews that are predominantly negative (rating 1-2 OR strongly negative language)
- net_sentiment: positive_reviews minus negative_reviews

Return exactly this JSON structure:
{
  "themes": {
    "<theme_code>": {
      "positive_count": number,
      "negative_count": number,
      "neutral_count": number,
      "net_sentiment": number,
      "representative_quote": string or null
    }
  },
  "overall": {
    "avg_rating": number,
    "positive_reviews": number,
    "negative_reviews": number,
    "net_sentiment": number,
    "total_reviews": number
  },
  "summary": "2-3 sentences summarising key themes, standout positives, and any concerns for this quarter"
}`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`)
    }

    const anthropicData = await anthropicRes.json()
    const rawText = anthropicData.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    const clean = rawText.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    // Build scores array
    const scores = Object.entries(result.themes).map(([code, data]) => {
      const d = data as {
        positive_count: number
        negative_count: number
        neutral_count: number
        net_sentiment: number
        representative_quote: string | null
      }
      return {
        practice_id: targetPracticeId,
        period,
        theme_code: code,
        positive_count: d.positive_count ?? 0,
        negative_count: d.negative_count ?? 0,
        neutral_count: d.neutral_count ?? 0,
        net_sentiment: d.net_sentiment ?? 0,
        representative_quote: d.representative_quote ?? null,
      }
    })

    // Delete existing scores for this period then insert fresh
    await supabase
      .from('review_theme_scores')
      .delete()
      .eq('practice_id', targetPracticeId)
      .eq('period', period)

    const { error: insertError } = await supabase
      .from('review_theme_scores')
      .insert(scores)
    if (insertError) throw insertError

    // Upsert upload record with overall metrics
    await supabase
      .from('review_uploads')
      .upsert({
        practice_id: targetPracticeId,
        period,
        review_count: reviews.length,
        uploaded_by: user.id,
        avg_rating: result.overall?.avg_rating ?? null,
        positive_reviews: result.overall?.positive_reviews ?? 0,
        negative_reviews: result.overall?.negative_reviews ?? 0,
        net_sentiment: result.overall?.net_sentiment ?? 0,
        summary: result.summary ?? null,
      }, { onConflict: 'practice_id,period' })

    return NextResponse.json({
      ok: true,
      period,
      reviewCount: reviews.length,
      summary: result.summary,
      overall: result.overall,
      themes: result.themes,
    })
  } catch (err) {
    console.error('POST /api/reviews/analyse error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
