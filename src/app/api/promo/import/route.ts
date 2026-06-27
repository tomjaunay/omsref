export const runtime = 'nodejs'
export const maxDuration = 60

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

    if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { csvText, practiceId, action } = body as {
      csvText?: string
      practiceId?: string
      events?: Array<{
        date: string
        activity_type: string
        practice_target: string
        notes: string
      }>
      action: 'parse' | 'confirm'
    }

    const targetPracticeId = (profile.role === 'superadmin' && practiceId)
      ? practiceId
      : profile.practice_id

    // ── PARSE: Claude maps CSV columns to fields ──────────────────────────────
    if (action === 'parse') {
      if (!csvText) return NextResponse.json({ error: 'No CSV provided' }, { status: 400 })

      const lines = csvText.trim().split(/\r?\n/)
      const headerLine = lines[0]
      const sampleRows = lines.slice(1, Math.min(6, lines.length)).join('\n')

      const prompt = `You are parsing a CSV file of marketing/promotional activities for a medical practice.

CSV HEADERS: ${headerLine}

SAMPLE ROWS (first 5):
${sampleRows}

FULL CSV (all rows):
${csvText}

Your task:
1. Identify which column contains each of these fields (or null if not present):
   - date: when the activity occurred
   - activity_type: type of activity — map to one of: visit, EDM, event, gift, educational, digital, other
   - practice_target: the name of the dental practice or person targeted
   - notes: any additional description or context

2. Extract ALL rows as structured events using those mappings.

3. For activity_type, use your judgment to map the source value to the closest of: visit, EDM, event, gift, educational, digital, other

4. For dates, convert to ISO format YYYY-MM-DD where possible. If only month/year, use the 1st of the month.

5. If practice_target is missing from the CSV, use empty string "".

Respond ONLY with valid JSON:
{
  "column_mapping": {
    "date": "source column name or null",
    "activity_type": "source column name or null",
    "practice_target": "source column name or null",
    "notes": "source column name or null"
  },
  "events": [
    {
      "date": "YYYY-MM-DD",
      "activity_type": "visit|EDM|event|gift|educational|digital|other",
      "practice_target": "string",
      "notes": "string",
      "raw_type": "original value from CSV"
    }
  ],
  "total_rows": number,
  "unmapped_columns": ["list of columns not mapped to any field"]
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
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!anthropicRes.ok) throw new Error(`Anthropic error: ${anthropicRes.status}`)

      const anthropicData = await anthropicRes.json()
      const rawText = anthropicData.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('')

      const clean = rawText.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)

      return NextResponse.json({
        ok: true,
        columnMapping: result.column_mapping,
        events: result.events,
        totalRows: result.total_rows,
        unmappedColumns: result.unmapped_columns ?? [],
      })
    }

    // ── CONFIRM: Save parsed events to promo_activities ───────────────────────
    if (action === 'confirm') {
      const { events } = body as {
        events: Array<{
          date: string
          activity_type: string
          practice_target: string
          notes: string
        }>
      }

      if (!events?.length) return NextResponse.json({ error: 'No events to save' }, { status: 400 })

      const batchId = crypto.randomUUID()

      const rows = events.map(e => ({
        practice_id: targetPracticeId,
        date: e.date,
        activity_type: e.activity_type ?? 'other',
        practice_target: e.practice_target ?? '',
        notes: e.notes ?? '',
        created_by: user.id,
        source: 'csv',
        import_batch_id: batchId,
      }))

      // Insert in batches of 200
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from('promo_activities')
          .insert(rows.slice(i, i + 200))
        if (error) throw error
      }

      return NextResponse.json({
        ok: true,
        imported: rows.length,
        batchId,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/promo/import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}