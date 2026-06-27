'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import Dashboard from '@/components/Dashboard'

interface UserRow {
  id: string
  full_name: string
  role: string
  created_at: string
}

export default function AdminPracticePage() {
  const { practiceId } = useParams<{ practiceId: string }>()
  const [tab, setTab] = useState<'dashboard' | 'users'>('dashboard')
  const [users, setUsers] = useState<UserRow[]>([])
  const [practiceName, setPracticeName] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('viewer')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/users?practiceId=${practiceId}`)
    const data = await res.json()
    setUsers(data.users ?? [])
  }, [practiceId])

  useEffect(() => {
    fetchUsers()
    // Get practice name
    fetch('/api/admin/practices').then(r => r.json()).then(data => {
      const p = data.practices?.find((p: { id: string; name: string }) => p.id === practiceId)
      if (p) setPracticeName(p.name)
    })
  }, [practiceId, fetchUsers])

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newEmail, password: newPassword,
        fullName: newName, role: newRole, practiceId,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setAdding(false); return }
    setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('viewer')
    setShowAddUser(false)
    setAdding(false)
    fetchUsers()
  }

  async function handleDeleteUser(userId: string, name: string) {
    if (!confirm(`Remove ${name}? This cannot be undone.`)) return
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    fetchUsers()
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const ROLE_LABELS: Record<string, string> = {
    superadmin: 'Superadmin',
    admin: 'Admin',
    viewer: 'Viewer',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f6f3', fontFamily: 'var(--font-sans)' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #ebe9e4', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/admin')} style={{ fontSize: 13, color: '#7a7870', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ← All practices
          </button>
          <span style={{ color: '#e2e0db' }}>|</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{practiceName || 'Practice'}</span>
          <span style={{ fontSize: 12, color: '#9b2222', background: '#fce8e8', padding: '1px 8px', borderRadius: 10, fontWeight: 500 }}>Superadmin</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dashboard', 'users'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                border: tab === t ? '1px solid #e2e0db' : '1px solid transparent',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#1a1a18' : '#7a7870',
                fontWeight: tab === t ? 500 : 400,
              }}
            >
              {t === 'dashboard' ? 'Dashboard' : 'Users'}
            </button>
          ))}
          <button onClick={() => router.push('/account')} style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#7a7870', marginLeft: 8 }}>
            Account
          </button>
          <button onClick={handleSignOut} style={{ padding: '6px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#9b2222' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Dashboard tab — reuse the existing Dashboard component with practice override */}
      {tab === 'dashboard' && (
        <Dashboard practiceId={practiceId} />
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Users ({users.length})</div>
            <button
              onClick={() => setShowAddUser(s => !s)}
              style={{ padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: '#1a6b3c', color: '#fff', cursor: 'pointer' }}
            >
              + Add user
            </button>
          </div>

          {showAddUser && (
            <div style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>New user for {practiceName}</div>
              <form onSubmit={handleAddUser}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 4 }}>Full name</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Dr Jane Smith"
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e0db', borderRadius: 6, fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 4 }}>Email</label>
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="jane@practice.com"
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e0db', borderRadius: 6, fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 4 }}>Password</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="min 8 characters"
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e0db', borderRadius: 6, fontFamily: 'inherit' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: '#7a7870', display: 'block', marginBottom: 4 }}>Role</label>
                    <select value={newRole} onChange={e => setNewRole(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e0db', borderRadius: 6, fontFamily: 'inherit', background: '#fff' }}>
                      <option value="viewer">Viewer</option>
                      <option value="admin">Admin</option>
                      <option value="superadmin">Superadmin</option>
                    </select>
                  </div>
                </div>
                {error && <div style={{ fontSize: 12, color: '#9b2222', marginBottom: 10 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" disabled={adding} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: adding ? '#ccc' : '#1a6b3c', color: '#fff', cursor: adding ? 'not-allowed' : 'pointer' }}>
                    {adding ? 'Adding…' : 'Add user'}
                  </button>
                  <button type="button" onClick={() => setShowAddUser(false)} style={{ padding: '8px 14px', fontSize: 13, borderRadius: 7, border: '1px solid #e2e0db', background: 'transparent', cursor: 'pointer', color: '#7a7870' }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => (
              <div key={u.id} style={{ background: '#fff', border: '1px solid #e2e0db', borderRadius: 9, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{u.full_name || '(no name)'}</div>
                  <div style={{ fontSize: 12, color: '#7a7870', marginTop: 1 }}>
                    <span style={{ background: u.role === 'superadmin' ? '#fce8e8' : u.role === 'admin' ? '#e8f5ee' : '#f0f0f0', color: u.role === 'superadmin' ? '#9b2222' : u.role === 'admin' ? '#1a6b3c' : '#7a7870', padding: '1px 7px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteUser(u.id, u.full_name)}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #e2e0db', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: '#9b2222' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}