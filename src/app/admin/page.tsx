'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import { fmt$ } from '@/lib/data'

interface PracticeSummary {
  id: string
  name: string
  slug: string
  userCount: number
  periodCount: number
}

export default function AdminPage() {
  const [practices, setPractices] = useState<PracticeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const fetchPractices = useCallback(async () => {
    const res = await fetch('/api/admin/practices')
    const data = await res.json()
    setPractices(data.practices ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPractices() }, [fetchPractices])

  async function handleSignOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function handleAddPractice(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError('')
    const res = await fetch('/api/admin/practices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, slug: newSlug }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setAdding(false); return }
    setNewName('')
    setNewSlug('')
    setShowAdd(false)
    setAdding(false)
    fetchPractices()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#7a7870' }}>Loading…</div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3', fontFamily: 'var(--font-sans)' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #ebe9e4', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>OMFS Analytics</span>
          <span style={{ fontSize: 12, background: '#fce8e8', padding: '1px 8px', borderRadius: 10, color: '#9b2222', fontWeight: 500 }}>Superadmin</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => router.push('/account')} style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#7a7870' }}>
            Account
          </button>
          <button onClick={handleSignOut} style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#9b2222' }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 2 }}>Practices</div>
            <div style={{ fontSize: 13, color: '#7a7870' }}>{practices.length} practice{practices.length !== 1 ? 's' : ''} registered</div>
          </div>
          <button
            onClick={() => setShowAdd(s => !s)}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: '#1a6b3c', color: '#fff', cursor: 'pointer' }}
          >
            + Add practice
          </button>
        </div>

        {showAdd && (
          <div style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>New practice</div>
            <form onSubmit={handleAddPractice} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={newName}
                onChange={e => {
                  setNewName(e.target.value)
                  setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
                }}
                placeholder="Practice name"
                required
                style={{ flex: 2, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'inherit', minWidth: 200 }}
              />
              <input
                value={newSlug}
                onChange={e => setNewSlug(e.target.value)}
                placeholder="slug (url-safe)"
                required
                style={{ flex: 1, padding: '8px 12px', fontSize: 13, border: '1px solid #e2e0db', borderRadius: 7, fontFamily: 'var(--font-mono)', minWidth: 140 }}
              />
              {error && <div style={{ width: '100%', fontSize: 12, color: '#9b2222' }}>{error}</div>}
              <button type="submit" disabled={adding} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: adding ? '#ccc' : '#1a6b3c', color: '#fff', cursor: adding ? 'not-allowed' : 'pointer' }}>
                {adding ? 'Adding…' : 'Add'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '8px 14px', fontSize: 13, borderRadius: 7, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#7a7870' }}>
                Cancel
              </button>
            </form>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {practices.map(p => (
            <div
              key={p.id}
              onClick={() => router.push(`/admin/${p.id}`)}
              style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#1a6b3c')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e0db')}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 3 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#7a7870', fontFamily: 'var(--font-mono)' }}>{p.slug}</div>
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600 }}>{p.periodCount}</div>
                  <div style={{ fontSize: 11, color: '#7a7870' }}>quarters</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 600 }}>{p.userCount}</div>
                  <div style={{ fontSize: 11, color: '#7a7870' }}>users</div>
                </div>
              </div>
              <div style={{ color: '#7a7870', fontSize: 16 }}>→</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}