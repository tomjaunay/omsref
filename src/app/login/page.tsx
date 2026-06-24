'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f7f6f3' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 12, padding: '40px 48px', width: 360 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>OMFS Referral Analytics</div>
        <div style={{ fontSize: 13, color: '#7a7870', marginBottom: 28 }}>Enter the practice password to continue</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{ width: '100%', padding: '9px 12px', fontSize: 14, border: '1px solid #e2e0db', borderRadius: 7, marginBottom: 12, fontFamily: 'inherit' }}
          />
          {error && <div style={{ fontSize: 12, color: '#9b2222', marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', background: '#1a6b3c', color: '#fff', cursor: 'pointer' }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}