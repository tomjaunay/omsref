import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// Server-side client (for API routes)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Browser client (for client components)
export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

export interface UserProfile {
  id: string
  practice_id: string
  role: 'superadmin' | 'admin' | 'viewer'
  full_name: string
}

export interface Practice {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface ReferrerRow {
  id?: string
  practice_id: string
  period: string
  referrer: string
  practice: string
  specialty: string
  suburb: string
  referrals: number
  income: number
}
