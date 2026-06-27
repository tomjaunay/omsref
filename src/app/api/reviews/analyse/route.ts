export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

const DEFAULT_THEMES = [
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

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('practice_id, role')
      .eq('id', session.user.id)
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

    // Fetch practice-specific themes if any, fall back to global defaults
    const { data: customThemes } = await supabase
      .from('review_themes')
      .select('code, label, description, sort_order')
      .or(`practice_id.eq.${targetPracticeId},practice_id.is.null`)
      .eq('active', true)
      .order('sort_order')

    const themes = customThemes && customThemes.length > 0
      ? customThemes
      : DEFAULT_THEMES

    const systemPrompt = `You are a qualitative analyst coding patient reviews for an Oral & Maxillofacial Surgery practice. 
You will be given a set of patient Google reviews and a codebook of themes.
For each theme, count how many reviews mention it positively, negatively, or neutrally.
A single review can mention multiple themes.
Also select the single most representative short quote (under 20 words) for each theme that has any mentions.
Respond ONLY with a valid JSON object — no preamble, no markdown, no explanation.`

    const userPrompt = `CODEBOOK:
${themes.map(t => `- ${t.code}: ${t.label} — ${t.description}`).join('\n')}

REVIEWS (${reviews.length} total for ${period}):
${reviews.map((r, i) => `[${i + 1}] Rating: ${r.rating}/5 | Date: ${r.date}\n${r.text}`).join('\n\n')}

Return a JSON object with this exact structure:
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
  "total_reviews_coded": number,
  "summary": string (2-3 sentence overall summary of this quarter's reviews)
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
      throw new Error(`Anthropic API error: ${anthropicRes.status}`)
    }

    const anthropicData = await anthropicRes.json()
    const rawText = anthropicData.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    const clean = rawText.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    // Save scores to database
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
        positive_count: d.positive_count,
        negative_count: d.negative_count,
        neutral_count: d.neutral_count,
        net_sentiment: d.net_sentiment,
        representative_quote: d.representative_quote ?? null,
      }
    })

    // Upsert scores (overwrite if re-uploading same period)
    await supabase
      .from('review_theme_scores')
      .delete()
      .eq('practice_id', targetPracticeId)
      .eq('period', period)

    const { error: insertError } = await supabase
      .from('review_theme_scores')
      .insert(scores)

    if (insertError) throw insertError

    // Upsert upload record
    await supabase
      .from('review_uploads')
      .upsert({
        practice_id: targetPracticeId,
        period,
        review_count: reviews.length,
        uploaded_by: session.user.id,
      }, { onConflict: 'practice_id,period' })

    return NextResponse.json({
      ok: true,
      period,
      reviewCount: reviews.length,
      summary: result.summary,
      themes: result.themes,
    })
  } catch (err) {
    console.error('POST /api/reviews/analyse error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}