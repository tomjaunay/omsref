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
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try { cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2]) } catch {}
        },
        remove(name: string, options: Record<string, unknown>) {
          try { cookieStore.set(name, '', options as Parameters<typeof cookieStore.set>[2]) } catch {}
        },
      },
    }
  )
}

export async function getSession() {
  const supabase = createServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function getProfile(): Promise<UserProfile | null> {
  const user = await getSession()
  if (!user) return null
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return data ?? null
}

export async function requireAuth() {
  const user = await getSession()
  if (!user) return null
  const profile = await getProfile()
  return profile
}

export async function requireSuperadmin() {
  const profile = await requireAuth()
  if (!profile || profile.role !== 'superadmin') return null
  return profile
}