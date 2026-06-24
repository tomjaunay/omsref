import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReferrerRow {
  id?: string
  period: string
  referrer: string
  practice: string
  specialty: string
  suburb: string
  referrals: number
  income: number
}

export interface Period {
  id?: string
  period: string
  uploaded_at?: string
  uploaded_by?: string
}

// ── Data helpers ──────────────────────────────────────────────────────────────

export async function fetchAllPeriods(): Promise<Period[]> {
  const { data, error } = await supabase
    .from('periods')
    .select('*')
    .order('period', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchReferrerRows(period?: string): Promise<ReferrerRow[]> {
  let q = supabase.from('referrer_rows').select('*')
  if (period) q = q.eq('period', period)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function upsertPeriod(
  period: string,
  rows: Omit<ReferrerRow, 'id' | 'period'>[],
  uploadedBy?: string
): Promise<void> {
  // Delete existing rows for this period (overwrite behaviour)
  await supabase.from('referrer_rows').delete().eq('period', period)

  // Upsert the period record
  const { error: pErr } = await supabase
    .from('periods')
    .upsert({ period, uploaded_by: uploadedBy }, { onConflict: 'period' })
  if (pErr) throw pErr

  // Insert referrer rows in batches of 200
  const fullRows = rows.map(r => ({ ...r, period }))
  for (let i = 0; i < fullRows.length; i += 200) {
    const { error: rErr } = await supabase
      .from('referrer_rows')
      .insert(fullRows.slice(i, i + 200))
    if (rErr) throw rErr
  }
}

export async function deletePeriod(period: string): Promise<void> {
  // referrer_rows cascade-deletes via FK
  const { error } = await supabase.from('periods').delete().eq('period', period)
  if (error) throw error
}
