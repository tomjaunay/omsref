import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
    else cur += ch
  }
  cells.push(cur.trim())
  return cells.map(c => c.replace(/^"|"$/g, '').trim())
}

function parseFullCSV(csvText: string): Array<Record<string, string>> {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const cells = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cells[i] ?? '' })
    return row
  }).filter(row => Object.values(row).some(v => v.trim()))
}

const VALID_TYPES = ['visit', 'EDM', 'event', 'gift', 'educational', 'digital', 'other']

function normaliseType(raw: string): string {
  const lower = raw.toLowerCase().trim()
  if (lower.includes('visit') || lower.includes('call') || lower.includes('meeting')) return 'visit'
  if (lower.includes('edm') || lower.includes('email') || lower.includes('newsletter')) return 'EDM'
  if (lower.includes('event') || lower.includes('conference') || lower.includes('seminar')) return 'event'
  if (lower.includes('gift') || lower.includes('hamper') || lower.includes('present')) return 'gift'
  if (lower.includes('edu') || lower.includes('training') || lower.includes('webinar')) return 'educational'
  if (lower.includes('digital') || lower.includes('social') || lower.includes('online') || lower.includes('web')) return 'digital'
  if (VALID_TYPES.includes(raw)) return raw
  return 'other'
}

function normaliseDate(raw: string): string {
  if (!raw?.trim()) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  }
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  } catch {}
  return raw
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

    if (!profile || !['superadmin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { csvText, practiceId, action } = body as {
      csvText?: string
      practiceId?: string
      events?: Array<{ date: string; activity_type: string; practice_target: string; notes: string }>
      action: 'parse' | 'confirm'
    }

    const targetPracticeId = (profile.role === 'superadmin' && practiceId)
      ? practiceId
      : profile.practice_id

    // ── PARSE ─────────────────────────────────────────────────────────────────
    if (action === 'parse') {
      if (!csvText) return NextResponse.json({ error: 'No CSV provided' }, { status: 400 })

      const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim())
      const headerLine = lines[0]
      const sampleLines = lines.slice(1, Math.min(6, lines.length))

      const mappingPrompt = [
        'You are mapping CSV columns for a marketing activities import.',
        '',
        'CSV HEADERS: ' + headerLine,
        '',
        'SAMPLE ROWS (first 5):',
        sampleLines.join('\n'),
        '',
        'Identify which column name maps to each required field:',
        '- date: when the activity occurred (date/time column)',
        '- activity_type: type of activity (visit, call, email, event, gift, etc.)',
        '- practice_target: the dental practice or person targeted',
        '- notes: any description, comments or additional context',
        '',
        'If a field has no matching column, use null.',
        '',
        'Respond ONLY with valid JSON, no markdown:',
        '{',
        '  "date": "exact column name or null",',
        '  "activity_type": "exact column name or null",',
        '  "practice_target": "exact column name or null",',
        '  "notes": "exact column name or null"',
        '}',
      ].join('\n')

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 500,
          messages: [{ role: 'user', content: mappingPrompt }],
        }),
      })

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text()
        throw new Error('Anthropic error ' + anthropicRes.status + ': ' + errText)
      }

      const anthropicData = await anthropicRes.json()
      const rawText = anthropicData.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('')

      const clean = rawText.replace(/```json|```/g, '').trim()
      const mapping = JSON.parse(clean) as {
        date: string | null
        activity_type: string | null
        practice_target: string | null
        notes: string | null
      }

      const allRows = parseFullCSV(csvText)
      const headers = parseCSVLine(lines[0])
      const unmappedColumns = headers.filter(h =>
        h !== mapping.date &&
        h !== mapping.activity_type &&
        h !== mapping.practice_target &&
        h !== mapping.notes
      )

      const events = allRows.map(row => {
        const rawDate = mapping.date ? (row[mapping.date] ?? '') : ''
        const rawType = mapping.activity_type ? (row[mapping.activity_type] ?? '') : ''
        const rawTarget = mapping.practice_target ? (row[mapping.practice_target] ?? '') : ''
        const baseNotes = mapping.notes ? (row[mapping.notes] ?? '') : ''
        const extraNotes = unmappedColumns
          .map(col => row[col] ? col + ': ' + row[col] : '')
          .filter(Boolean)
          .join(' | ')
        const notes = [baseNotes, extraNotes].filter(Boolean).join(' — ')

        return {
          date: normaliseDate(rawDate),
          activity_type: rawType ? normaliseType(rawType) : 'other',
          practice_target: rawTarget,
          notes,
          raw_type: rawType,
        }
      }).filter(e => e.date)

      return NextResponse.json({
        ok: true,
        columnMapping: mapping,
        events,
        totalRows: allRows.length,
        parsedRows: events.length,
        skippedRows: allRows.length - events.length,
        unmappedColumns,
      })
    }

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    if (action === 'confirm') {
      const { events } = body as {
        events: Array<{ date: string; activity_type: string; practice_target: string; notes: string }>
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

      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase
          .from('promo_activities')
          .insert(rows.slice(i, i + 200))
        if (error) throw error
      }

      return NextResponse.json({ ok: true, imported: rows.length, batchId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('POST /api/promo/import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
