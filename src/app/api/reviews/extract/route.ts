export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

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
    const { images } = body as {
      images: Array<{ data: string; mediaType: string }>
    }

    if (!images || images.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    }

    // Build content array with all images + extraction prompt
    const content: Array<Record<string, unknown>> = []

    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType,
          data: img.data,
        },
      })
    }

    content.push({
      type: 'text',
      text: `Extract all Google reviews visible in these screenshots.
For each review extract:
- date: the review date as shown (e.g. "3 weeks ago", "January 2026", "2026-01-15")
- rating: star rating as a number 1-5
- text: the full review text content

If a review is truncated with "More", include as much text as is visible.
Ignore any review responses from the business owner.
Ignore profile photos, names, and any UI elements — only extract date, rating, and text.

Respond ONLY with valid JSON, no markdown:
{
  "reviews": [
    {
      "date": string,
      "rating": number,
      "text": string
    }
  ],
  "total_found": number
}`,
    })

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content }],
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

    return NextResponse.json({
      ok: true,
      reviews: result.reviews ?? [],
      totalFound: result.total_found ?? result.reviews?.length ?? 0,
    })
  } catch (err) {
    console.error('POST /api/reviews/extract error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}