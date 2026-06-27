'use client'
import { useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const supabase = createBrowserSupabase()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f7f6f3' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 12, padding: '40px 48px', width: 380 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Reset password</div>
        <div style={{ fontSize: 13, color: '#7a7870', marginBottom: 28 }}>
          Enter your email and we'll send you a reset link.
        </div>

        {sent ? (
          <div style={{ fontSize: 13, color: '#1a6b3c', background: '#e8f5ee', padding: '12px 14px', borderRadius: 8 }}>
            Check your email for a password reset link.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 5, fontWeight: 500 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'inherit' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', background: loading ? '#ccc' : '#1a6b3c', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <a href="/login" style={{ fontSize: 12, color: '#7a7870', textDecoration: 'none' }}>← Back to sign in</a>
        </div>
      </div>
    </div>
  )
}