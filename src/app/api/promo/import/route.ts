export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'

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
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]
    return `${year}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  }
  // Try native parse as fallback
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

    // ── PARSE ────────────────────────────────────────────────────────────────
    if (action === 'parse') {
      if (!csvText) return NextResponse.json({ error: 'No CSV provided' }, { status: 400 })

      const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim())
      const headerLine = lines[0]
      const sampleLines = lines.slice(1, Math.min(6, lines.length))

      // Send only headers + 5 sample rows to Claude for mapping
      const mappingPrompt =