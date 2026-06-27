import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

// Service role client for user management (bypasses RLS)
function createServiceClient() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('user_profiles').select('role, practice_id').eq('id', session.user.id).single()

    if (!profile || !['superadmin', 'admin'].includes(profile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const practiceId = searchParams.get('practiceId') ?? profile.practice_id

    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, created_at')
      .eq('practice_id', practiceId)
      .order('created_at')

    return NextResponse.json({ users: users ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('user_profiles').select('role, practice_id').eq('id', session.user.id).single()

    if (!callerProfile || !['superadmin', 'admin'].includes(callerProfile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { email, password, fullName, role, practiceId } = await req.json()

    // Admins can only add viewers to their own practice
    const targetPracticeId = callerProfile.role === 'superadmin'
      ? (practiceId ?? callerProfile.practice_id)
      : callerProfile.practice_id

    const targetRole = callerProfile.role === 'superadmin' ? role : 'viewer'

    const serviceClient = createServiceClient()

    // Create auth user
    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })

    if (createError) throw createError

    // Set their profile
    const { error: profileError } = await serviceClient
      .from('user_profiles')
      .upsert({
        id: newUser.user.id,
        practice_id: targetPracticeId,
        role: targetRole,
        full_name: fullName,
      })

    if (profileError) throw profileError

    return NextResponse.json({ ok: true, userId: newUser.user.id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await supabase
      .from('user_profiles').select('role, practice_id').eq('id', session.user.id).single()

    if (!callerProfile || !['superadmin', 'admin'].includes(callerProfile.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId } = await req.json()
    const serviceClient = createServiceClient()

    const { error } = await serviceClient.auth.admin.deleteUser(userId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}