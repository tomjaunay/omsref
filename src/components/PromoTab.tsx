'use client'
import { useState, useEffect, useCallback } from 'react'

interface PromoActivity {
  id: string
  date: string
  activity_type: string
  practice_target: string
  notes: string
  created_at: string
}

interface PromoTabProps {
  practiceId?: string
}

const ACTIVITY_TYPES = ['visit', 'EDM', 'event', 'gift', 'educational', 'digital', 'other']

const TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  visit:       { bg: '#e8f0fa', color: '#1a4a7a' },
  EDM:         { bg: '#e8f5ee', color: '#1a6b3c' },
  event:       { bg: '#f3e8fa', color: '#7a3a8a' },
  gift:        { bg: '#fff3e0', color: '#b35d00' },
  educational: { bg: '#e8f5f7', color: '#1a6b7a' },
  digital:     { bg: '#eeeef7', color: '#3a3a8a' },
  other:       { bg: '#f0f0f0', color: '#7a7870' },
}

const EMPTY_FORM = { date: '', activity_type: 'visit', practice_target: '', notes: '' }

export default function PromoTab({ practiceId }: PromoTabProps) {
  const [activities, setActivities] = useState<PromoActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [search, setSearch] = useState('')

  const fetchActivities = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', practiceId }),
      })
      const data = await res.json()
      setActivities(data.activities ?? [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [practiceId])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  async function handleSave() {
    if (!form.date || !form.activity_type) { setError('Date and activity type are required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingId ? 'update' : 'create',
          id: editingId,
          practiceId,
          ...form,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setShowAdd(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await fetchActivities()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this activity? This cannot be undone.')) return
    await fetch('/api/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id, practiceId }),
    })
    await fetchActivities()
  }

  function startEdit(a: PromoActivity) {
    setForm({ date: a.date, activity_type: a.activity_type, practice_target: a.practice_target, notes: a.notes })
    setEditingId(a.id)
    setShowAdd(true)
    setError('')
  }

  function cancelForm() {
    setShowAdd(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const filtered = activities.filter(a => {
    if (filterType !== 'all' && a.activity_type !== filterType) return false
    if (search && !a.practice_target.toLowerCase().includes(search.toLowerCase()) && !a.notes.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group by year-quarter for display
  function getQuarter(dateStr: string): string {
    const d = new Date(dateStr)
    const q = Math.ceil((d.getMonth() + 1) / 3)
    return `${d.getFullYear()}Q${q}`
  }

  const grouped: Record<string, PromoActivity[]> = {}
  for (const a of filtered) {
    const q = getQuarter(a.date)
    if (!grouped[q]) grouped[q] = []
    grouped[q].push(a)
  }
  const sortedGroups = Object.keys(grouped).sort().reverse()

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid var(--border)', borderRadius: 6,
    fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)',
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--muted)' }}>
      Loading activities…
    </div>
  )

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search practice or notes…"
            style={{ padding: '7px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, width: 240, background: 'var(--surface)', color: 'var(--text)' }}
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }}
          >
            <option value="all">All types</option>
            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); setForm(EMPTY_FORM); setError('') }}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
        >
          + Add activity
        </button>
      </div>

      {/* Add / Edit form */}
      {showAdd && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
            {editingId ? 'Edit activity' : 'New promotional activity'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Activity type</label>
              <select
                value={form.activity_type}
                onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
                style={inputStyle}
              >
                {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Practice target</label>
              <input
                value={form.practice_target}
                onChange={e => setForm(f => ({ ...f, practice_target: e.target.value }))}
                placeholder="e.g. Jones Karolewski"
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Describe the activity…"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: saving ? 'var(--border)' : 'var(--accent)', color: saving ? 'var(--muted)' : '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add activity'}
            </button>
            <button
              onClick={cancelForm}
              style={{ padding: '8px 14px', fontSize: 13, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Activity list grouped by quarter */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📣</div>
          <div style={{ fontSize: 14, marginBottom: 6 }}>No activities recorded yet</div>
          <div style={{ fontSize: 13 }}>Track visits, EDMs, events and other outreach here</div>
        </div>
      ) : (
        <div>
          {sortedGroups.map(quarter => (
            <div key={quarter} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--divider)' }}>
                {quarter} · {grouped[quarter].length} activit{grouped[quarter].length !== 1 ? 'ies' : 'y'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {grouped[quarter].sort((a, b) => b.date.localeCompare(a.date)).map(a => {
                  const ts = TYPE_STYLES[a.activity_type] ?? TYPE_STYLES.other
                  return (
                    <div
                      key={a.id}
                      style={{ display: 'flex', alignItems: 'flex-start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', gap: 14 }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)', minWidth: 80, paddingTop: 2 }}>
                        {new Date(a.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: a.notes ? 4 : 0 }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500, background: ts.bg, color: ts.color }}>
                            {a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1)}
                          </span>
                          {a.practice_target && (
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{a.practice_target}</span>
                          )}
                        </div>
                        {a.notes && (
                          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{a.notes}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => startEdit(a)}
                          style={{ padding: '3px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', background: 'transparent', color: 'var(--muted)' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          style={{ padding: '3px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', background: 'transparent', color: 'var(--red)' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}