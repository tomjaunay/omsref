import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase env vars:', {
    url: supabaseUrl ? 'SET' : 'MISSING',
    key: supabaseAnonKey ? 'SET' : 'MISSING',
  })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  const { error: delErr } = await supabase
    .from('referrer_rows')
    .delete()
    .eq('period', period)
  if (delErr) throw delErr

  const { error: pErr } = await supabase
    .from('periods')
    .upsert({ period, uploaded_by: uploadedBy }, { onConflict: 'period' })
  if (pErr) throw pErr

  const fullRows = rows.map(r => ({ ...r, period }))
  for (let i = 0; i < fullRows.length; i += 200) {
    const { error: rErr } = await supabase
      .from('referrer_rows')
      .insert(fullRows.slice(i, i + 200))
    if (rErr) throw rErr
  }
}

export async function deletePeriod(period: string): Promise<void> {
  const { error } = await supabase.from('periods').delete().eq('period', period)
  if (error) throw error
}