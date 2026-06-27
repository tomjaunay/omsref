import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type UserProfile } from './supabase'

export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: Record<string, unknown>) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: Record<string, unknown>) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}

export async function getSession() {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(): Promise<UserProfile | null> {
  const session = await getSession()
  if (!session) return null

  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()

  return data ?? null
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) return null
  const profile = await getProfile()
  return profile
}

export async function requireSuperadmin() {
  const profile = await requireAuth()
  if (!profile || profile.role !== 'superadmin') return null
  return profile
}