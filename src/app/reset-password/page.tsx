'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push('/')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f7f6f3' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 12, padding: '40px 48px', width: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Set new password</div>
        <div style={{ fontSize: 13, color: '#7a7870', marginBottom: 28 }}>Choose a strong password for your account.</div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 5, fontWeight: 500 }}>New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'inherit' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 5, fontWeight: 500 }}>Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'inherit' }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#9b2222', background: '#fce8e8', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', background: loading ? '#ccc' : '#1a6b3c', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}