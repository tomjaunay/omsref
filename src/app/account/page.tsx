'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'

export default function AccountPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) { setError('Passwords do not match'); return }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')
    setSuccess('')
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess('Password updated successfully')
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setLoading(false)
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #ebe9e4', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Account settings</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/')} style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#7a7870' }}>
            ← Dashboard
          </button>
          <button onClick={handleSignOut} style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#9b2222' }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 24px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 12, padding: '32px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Change password</div>
          <div style={{ fontSize: 13, color: '#7a7870', marginBottom: 24 }}>Choose a strong password of at least 8 characters.</div>

          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 5, fontWeight: 500 }}>New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 5, fontWeight: 500 }}>Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'inherit' }}
              />
            </div>

            {error && <div style={{ fontSize: 12, color: '#9b2222', background: '#fce8e8', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>{error}</div>}
            {success && <div style={{ fontSize: 12, color: '#1a6b3c', background: '#e8f5ee', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>{success}</div>}

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', background: loading ? '#ccc' : '#1a6b3c', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}