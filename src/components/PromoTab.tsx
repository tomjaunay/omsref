'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface PromoActivity {
  id: string
  date: string
  activity_type: string
  practice_target: string
  notes: string
  created_at: string
  source?: string
}

interface AttributionRow {
  id: string
  date: string
  quarter: string
  activity_type: string
  practice_target: string
  notes: string
  matched: boolean
  refsAtEvent: number | null
  refsQ1: number | null
  refsQ2: number | null
  q1Label: string
  q2Label: string
  response: 'responded' | 'lagged' | 'flat' | 'declined' | 'no_data'
}

interface AttributionSummary {
  totalEvents: number
  matchedPractices: number
  responded: number
  responseRate: number
}

interface ParsedEvent {
  date: string
  activity_type: string
  practice_target: string
  notes: string
  raw_type?: string
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

const RESPONSE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  responded: { bg: '#d4edda', color: '#155724', label: '↑ responded' },
  lagged:    { bg: '#e8f5ee', color: '#1a6b3c', label: '↑ lagged' },
  flat:      { bg: '#f5f0e0', color: '#7a6000', label: '→ flat' },
  declined:  { bg: '#fce8e8', color: '#9b2222', label: '↓ declined' },
  no_data:   { bg: '#f0f0f0', color: '#999',    label: '— no data' },
}

const EMPTY_FORM = { date: '', activity_type: 'visit', practice_target: '', notes: '' }

export default function PromoTab({ practiceId }: PromoTabProps) {
  const [view, setView] = useState<'log' | 'import' | 'attribution'>('log')
  const [activities, setActivities] = useState<PromoActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')

  // Import state
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[] | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string> | null>(null)
  const [unmappedColumns, setUnmappedColumns] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Attribution state
  const [attribution, setAttribution] = useState<AttributionRow[]>([])
  const [attrSummary, setAttrSummary] = useState<AttributionSummary | null>(null)
  const [attrLoading, setAttrLoading] = useState(false)
  const [attrFilter, setAttrFilter] = useState<string>('all')

  const fileRef = useRef<HTMLInputElement>(null)

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
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [practiceId])

  const fetchAttribution = useCallback(async () => {
    setAttrLoading(true)
    try {
      const res = await fetch('/api/promo/attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practiceId }),
      })
      const data = await res.json()
      setAttribution(data.attribution ?? [])
      setAttrSummary(data.summary ?? null)
    } catch (e) { console.error(e) }
    setAttrLoading(false)
  }, [practiceId])

  useEffect(() => { fetchActivities() }, [fetchActivities])

  useEffect(() => {
    if (view === 'attribution') fetchAttribution()
  }, [view, fetchAttribution])

  // ── Manual CRUD ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.date || !form.activity_type) { setError('Date and activity type are required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: editingId ? 'update' : 'create', id: editingId, practiceId, ...form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setShowAdd(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      await fetchActivities()
    } catch (e) { setError((e as Error).message) }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this activity?')) return
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

  // ── CSV Import ──────────────────────────────────────────────────────────────
  async function handleParse() {
    if (!importFile) return
    setImporting(true)
    setImportMsg(null)
    setParsedEvents(null)
    try {
      const csvText = await importFile.text()
      const res = await fetch('/api/promo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'parse', csvText, practiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setParsedEvents(data.events)
      setColumnMapping(data.columnMapping)
      setUnmappedColumns(data.unmappedColumns ?? [])
    } catch (e) {
      setImportMsg({ type: 'error', text: `Parse failed: ${(e as Error).message}` })
    }
    setImporting(false)
  }

  async function handleConfirmImport() {
    if (!parsedEvents?.length) return
    setConfirming(true)
    try {
      const res = await fetch('/api/promo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', events: parsedEvents, practiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportMsg({ type: 'success', text: `${data.imported} activities imported successfully.` })
      setParsedEvents(null)
      setColumnMapping(null)
      setImportFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await fetchActivities()
      setTimeout(() => setView('log'), 1500)
    } catch (e) {
      setImportMsg({ type: 'error', text: (e as Error).message })
    }
    setConfirming(false)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getQuarter(dateStr: string): string {
    const d = new Date(dateStr)
    return `${d.getFullYear()}Q${Math.ceil((d.getMonth() + 1) / 3)}`
  }

  const filtered = activities.filter(a => {
    if (filterType !== 'all' && a.activity_type !== filterType) return false
    if (search && !a.practice_target.toLowerCase().includes(search.toLowerCase()) && !a.notes.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const grouped: Record<string, PromoActivity[]> = {}
  for (const a of filtered) {
    const q = getQuarter(a.date)
    if (!grouped[q]) grouped[q] = []
    grouped[q].push(a)
  }
  const sortedGroups = Object.keys(grouped).sort().reverse()

  const filteredAttribution = attrFilter === 'all'
    ? attribution
    : attribution.filter(a => a.response === attrFilter)

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
      {/* Sub-nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { val: 'log', label: 'Activity log' },
            { val: 'import', label: '↑ Import CSV' },
            { val: 'attribution', label: '📊 Attribution' },
          ] as const).map(({ val, label }) => (
            <button key={val} onClick={() => setView(val)} style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
              border: view === val ? '1px solid var(--border)' : '1px solid transparent',
              background: view === val ? 'var(--surface)' : 'transparent',
              color: view === val ? 'var(--text)' : 'var(--muted)',
              fontWeight: view === val ? 500 : 400,
              boxShadow: view === val ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
            }}>{label}</button>
          ))}
        </div>
        {view === 'log' && (
          <button
            onClick={() => { setShowAdd(true); setEditingId(null); setForm(EMPTY_FORM); setError('') }}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            + Add activity
          </button>
        )}
      </div>

      {/* ── ACTIVITY LOG ── */}
      {view === 'log' && (
        <div>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search practice or notes…"
              style={{ padding: '7px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, width: 240, background: 'var(--surface)', color: 'var(--text)' }}
            />
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }}>
              <option value="all">All types</option>
              {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 4 }}>
              {filtered.length} activit{filtered.length !== 1 ? 'ies' : 'y'}
            </div>
          </div>

          {/* Add/Edit form */}
          {showAdd && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
                {editingId ? 'Edit activity' : 'New promotional activity'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Date</label>
                  <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Activity type</label>
                  <select value={form.activity_type} onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))} style={inputStyle}>
                    {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Practice target</label>
                  <input value={form.practice_target} onChange={e => setForm(f => ({ ...f, practice_target: e.target.value }))} placeholder="e.g. Jones Karolewski" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSave} disabled={saving}
                  style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: saving ? 'var(--border)' : 'var(--accent)', color: saving ? 'var(--muted)' : '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add activity'}
                </button>
                <button onClick={() => { setShowAdd(false); setEditingId(null); setForm(EMPTY_FORM); setError('') }}
                  style={{ padding: '8px 14px', fontSize: 13, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Grouped activity list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📣</div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>No activities recorded yet</div>
              <div style={{ fontSize: 13 }}>Add manually or import a CSV</div>
            </div>
          ) : (
            sortedGroups.map(quarter => (
              <div key={quarter} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--divider)' }}>
                  {quarter} · {grouped[quarter].length} activit{grouped[quarter].length !== 1 ? 'ies' : 'y'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {grouped[quarter].sort((a, b) => b.date.localeCompare(a.date)).map(a => {
                    const ts = TYPE_STYLES[a.activity_type] ?? TYPE_STYLES.other
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', gap: 14 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)', minWidth: 80, paddingTop: 2 }}>
                          {new Date(a.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: a.notes ? 4 : 0 }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500, background: ts.bg, color: ts.color }}>
                              {a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1)}
                            </span>
                            {a.practice_target && <span style={{ fontSize: 13, fontWeight: 500 }}>{a.practice_target}</span>}
                            {a.source === 'csv' && <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>CSV</span>}
                          </div>
                          {a.notes && <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{a.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEdit(a)}
                            style={{ padding: '3px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', background: 'transparent', color: 'var(--muted)' }}>
                            Edit
                          </button>
                          <button onClick={() => handleDelete(a.id)}
                            style={{ padding: '3px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', background: 'transparent', color: 'var(--red)' }}>
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── CSV IMPORT ── */}
      {view === 'import' && (
        <div style={{ maxWidth: 640 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>Import activities from CSV</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
            Upload any CSV containing promotional activities. Claude will automatically detect and map columns to the required fields — date, activity type, practice target, and notes.
          </div>

          {!parsedEvents ? (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; const f = e.dataTransfer.files[0]; if (f) setImportFile(f) }}
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 32, textAlign: 'center', cursor: 'pointer', marginBottom: 16 }}
              >
                {importFile ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>{importFile.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{(importFile.size / 1024).toFixed(1)} KB · click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>Drop CSV here or click to browse</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Any format — Claude will map the columns</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setImportFile(e.target.files?.[0] ?? null)} />

              <button
                onClick={handleParse}
                disabled={importing || !importFile}
                style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: importing || !importFile ? 'not-allowed' : 'pointer', background: importing || !importFile ? 'var(--border)' : 'var(--accent)', color: importing || !importFile ? 'var(--muted)' : '#fff' }}
              >
                {importing ? 'Claude is mapping your CSV…' : 'Parse & preview'}
              </button>

              {importing && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                  Claude is reading your CSV headers and extracting events — this may take 15–20 seconds…
                </div>
              )}
            </>
          ) : (
            <>
              {/* Column mapping summary */}
              <div style={{ background: 'var(--accent-l)', border: '1px solid #b2dfc2', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-d)', marginBottom: 8 }}>
                  ✓ Claude mapped {parsedEvents.length} events from your CSV
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {columnMapping && Object.entries(columnMapping).map(([field, col]) => (
                    <div key={field} style={{ fontSize: 12, color: 'var(--accent-d)' }}>
                      <strong>{field}:</strong> {col ?? <em style={{ color: 'var(--muted)' }}>not found</em>}
                    </div>
                  ))}
                </div>
                {unmappedColumns.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Unused columns: {unmappedColumns.join(', ')}
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div style={{ overflowX: 'auto', marginBottom: 16, maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)' }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1px solid var(--border)' }}>Date</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1px solid var(--border)' }}>Type</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1px solid var(--border)' }}>Practice target</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1px solid var(--border)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedEvents.map((e, i) => {
                      const ts = TYPE_STYLES[e.activity_type] ?? TYPE_STYLES.other
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--divider)' }}>
                          <td style={{ padding: '7px 10px', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{e.date}</td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 6, fontWeight: 500, background: ts.bg, color: ts.color }}>
                              {e.activity_type}
                            </span>
                            {e.raw_type && e.raw_type !== e.activity_type && (
                              <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>({e.raw_type})</span>
                            )}
                          </td>
                          <td style={{ padding: '7px 10px', fontWeight: 500 }}>{e.practice_target || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={handleConfirmImport}
                  disabled={confirming}
                  style={{ flex: 1, padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: confirming ? 'not-allowed' : 'pointer', background: confirming ? 'var(--border)' : 'var(--accent)', color: confirming ? 'var(--muted)' : '#fff' }}
                >
                  {confirming ? 'Importing…' : `Import ${parsedEvents.length} activities`}
                </button>
                <button
                  onClick={() => { setParsedEvents(null); setColumnMapping(null); setImportFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ padding: '10px 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {importMsg && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, fontSize: 13, background: importMsg.type === 'success' ? 'var(--accent-l)' : 'var(--red-l)', color: importMsg.type === 'success' ? 'var(--accent-d)' : 'var(--red)', border: `1px solid ${importMsg.type === 'success' ? '#b2dfc2' : '#f0c0c0'}` }}>
              {importMsg.text}
            </div>
          )}
        </div>
      )}

      {/* ── ATTRIBUTION ── */}
      {view === 'attribution' && (
        <div>
          {attrLoading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Calculating attribution…</div>
          ) : (
            <>
              {/* Summary cards */}
              {attrSummary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Total events', value: attrSummary.totalEvents },
                    { label: 'Matched practices', value: attrSummary.matchedPractices },
                    { label: 'Practices responded', value: attrSummary.responded },
                    { label: 'Response rate', value: `${attrSummary.responseRate}%` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 16px' }}>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Filter */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {(['all', 'responded', 'lagged', 'flat', 'declined', 'no_data'] as const).map(f => (
                  <button key={f} onClick={() => setAttrFilter(f)} style={{
                    padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                    border: attrFilter === f ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: attrFilter === f ? 'var(--accent-l)' : 'transparent',
                    color: attrFilter === f ? 'var(--accent-d)' : 'var(--muted)',
                    fontWeight: attrFilter === f ? 500 : 400,
                  }}>
                    {f === 'all' ? 'All' : RESPONSE_STYLES[f].label}
                    {f !== 'all' && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--muted)' }}>({attribution.filter(a => a.response === f).length})</span>}
                  </button>
                ))}
              </div>

              {/* Attribution table */}
              {filteredAttribution.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 13 }}>
                  No events match this filter.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)' }}>Type</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)' }}>Practice</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', fontFamily: 'var(--font-mono)' }}>Event qtr</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', fontFamily: 'var(--font-mono)' }}>Q+1</th>
                        <th style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', fontFamily: 'var(--font-mono)' }}>Q+2</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)' }}>Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAttribution.map(a => {
                        const ts = TYPE_STYLES[a.activity_type] ?? TYPE_STYLES.other
                        const rs = RESPONSE_STYLES[a.response]
                        return (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--divider)' }}
                            onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '#f2f1ee')}
                            onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '')}>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                              {new Date(a.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500, background: ts.bg, color: ts.color }}>
                                {a.activity_type}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 500 }}>
                              {a.practice_target || <span style={{ color: 'var(--muted)' }}>—</span>}
                              {!a.matched && a.practice_target && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>no match</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {a.refsAtEvent !== null ? a.refsAtEvent : <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {a.refsQ1 !== null ? (
                                <span style={{ color: a.refsAtEvent !== null ? (a.refsQ1 > a.refsAtEvent ? '#1a7a35' : a.refsQ1 < a.refsAtEvent ? '#b33030' : 'inherit') : 'inherit' }}>
                                  {a.refsQ1}
                                </span>
                              ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                              {a.refsQ2 !== null ? (
                                <span style={{ color: a.refsAtEvent !== null ? (a.refsQ2 > a.refsAtEvent ? '#1a7a35' : a.refsQ2 < a.refsAtEvent ? '#b33030' : 'inherit') : 'inherit' }}>
                                  {a.refsQ2}
                                </span>
                              ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 500, background: rs.bg, color: rs.color }}>
                                {rs.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--blue-l)', color: 'var(--blue)', fontSize: 12, lineHeight: 1.6 }}>
                <strong>How attribution works:</strong> Each event is matched to a practice in your referral data by name. Referral counts for the event quarter, Q+1 and Q+2 are compared. A practice is marked as <strong>responded</strong> if referrals increased &gt;20% in Q+1, <strong>lagged</strong> if the increase came in Q+2, <strong>flat</strong> if change was &lt;20%, or <strong>declined</strong> if referrals fell &gt;20%. Practices not found in referral data are marked as <strong>no data</strong>.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}