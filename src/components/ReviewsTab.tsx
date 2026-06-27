'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Sparkline from './Sparkline'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ThemeScore {
  period: string
  theme_code: string
  positive_count: number
  negative_count: number
  neutral_count: number
  net_sentiment: number
  representative_quote: string | null
}

interface ThemeDef {
  id: string
  code: string
  label: string
  description: string
  sort_order: number
  active: boolean
  practice_id: string | null
}

interface UploadRecord {
  period: string
  review_count: number
  uploaded_at: string
  avg_rating?: number | null
  positive_reviews?: number
  negative_reviews?: number
  net_sentiment?: number
  summary?: string | null
}

interface ReviewsTabProps {
  practiceId?: string
}

// ── CSV parser ─────────────────────────────────────────────────────────────────
function parseReviewsCSV(text: string): Array<{ text: string; rating: number; date: string }> | null {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return null
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  const ratingIdx = headers.findIndex(h => h.includes('rating') || h.includes('star'))
  const textIdx = headers.findIndex(h =>
    h.includes('text') || h.includes('comment') ||
    h.includes('review') || h.includes('body') || h.includes('content')
  )
  const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time'))
  if (textIdx === -1) return null

  const rows: Array<{ text: string; rating: number; date: string }> = []
  for (let i = 1; i < lines.length; i++) {
    const cells: string[] = []
    let cur = '', inQ = false
    for (const ch of lines[i]) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    const reviewText = (cells[textIdx] ?? '').replace(/^"|"$/g, '').trim()
    if (!reviewText) continue
    rows.push({
      text: reviewText,
      rating: ratingIdx >= 0 ? parseInt(cells[ratingIdx] ?? '5') || 5 : 5,
      date: dateIdx >= 0 ? (cells[dateIdx] ?? '').replace(/^"|"$/g, '').trim() : '',
    })
  }
  return rows.length > 0 ? rows : null
}

// ── Paste parser ───────────────────────────────────────────────────────────────
function parsePastedReviews(text: string): Array<{ text: string; rating: number; date: string }> {
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean)
  return blocks.map(block => {
    const ratingMatch = block.match(/([1-5])\s*(?:star|\/5|out of 5)?/i)
    const rating = ratingMatch ? parseInt(ratingMatch[1]) : 5
    const dateMatch = block.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{4}/)
    const date = dateMatch ? dateMatch[0] : ''
    return { text: block, rating, date }
  }).filter(r => r.text.length > 10)
}

// ── Sentiment helpers ─────────────────────────────────────────────────────────
function sentimentColor(net: number): string {
  if (net > 5)   return '#1a7a35'
  if (net > 0)   return '#6aaa6a'
  if (net === 0) return '#c89a00'
  if (net > -5)  return '#d4732a'
  return '#b33030'
}

// ── Codebook editor ───────────────────────────────────────────────────────────
function CodebookEditor({
  practiceId,
  onClose,
}: {
  practiceId?: string
  onClose: () => void
}) {
  const [globalThemes, setGlobalThemes] = useState<ThemeDef[]>([])
  const [practiceThemes, setPracticeThemes] = useState<ThemeDef[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ code: '', label: '', description: '', sort_order: 99 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchCodebook = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/reviews/codebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', practiceId }),
    })
    const data = await res.json()
    setGlobalThemes(data.globalThemes ?? [])
    setPracticeThemes(data.practiceThemes ?? [])
    setLoading(false)
  }, [practiceId])

  useEffect(() => { fetchCodebook() }, [fetchCodebook])

  const practiceMap = new Map(practiceThemes.map(t => [t.code, t]))
  const mergedGlobals = globalThemes.map(g => ({
    ...g,
    override: practiceMap.get(g.code),
    effectiveActive: practiceMap.has(g.code) ? practiceMap.get(g.code)!.active : g.active,
  }))
  const customThemes = practiceThemes.filter(t => !globalThemes.find(g => g.code === t.code))

  async function toggleGlobal(theme: ThemeDef, active: boolean) {
    await fetch('/api/reviews/codebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle',
        code: theme.code,
        label: theme.label,
        description: theme.description,
        sort_order: theme.sort_order,
        active,
        practiceId,
      }),
    })
    fetchCodebook()
  }

  async function saveTheme() {
    if (!form.code || !form.label) { setError('Code and label are required'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/reviews/codebook', {
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
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowAdd(false)
    setEditingId(null)
    setForm({ code: '', label: '', description: '', sort_order: 99 })
    setSaving(false)
    fetchCodebook()
  }

  async function deleteTheme(id: string) {
    if (!confirm('Remove this custom theme?')) return
    await fetch('/api/reviews/codebook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id, practiceId }),
    })
    fetchCodebook()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border)', borderRadius: 6,
    fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, overflowY: 'auto' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 680, margin: '0 24px 60px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--divider)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Theme codebook</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Configure which themes Claude codes reviews against</div>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                Global themes — toggle on/off for this practice
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                {mergedGlobals.map(g => (
                  <div key={g.code} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ paddingTop: 2 }}>
                      <input
                        type="checkbox"
                        checked={g.effectiveActive}
                        onChange={e => toggleGlobal(g, e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: g.effectiveActive ? 'var(--text)' : 'var(--muted)' }}>{g.label}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>{g.code}</span>
                        {g.override && (
                          <span style={{ fontSize: 10, color: 'var(--accent-d)', background: 'var(--accent-l)', padding: '1px 6px', borderRadius: 4 }}>overridden</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{g.description}</div>
                    </div>
                  </div>
                ))}
              </div>

              {customThemes.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    Practice-specific themes
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {customThemes.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'var(--accent-l)', borderRadius: 8, border: '1px solid #b2dfc2' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</span>
                            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', background: 'white', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>{t.code}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t.description}</div>
                        </div>
                        <button
                          onClick={() => {
                            setForm({ code: t.code, label: t.label, description: t.description, sort_order: t.sort_order })
                            setEditingId(t.id)
                            setShowAdd(true)
                          }}
                          style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', background: 'white', color: 'var(--muted)' }}
                        >Edit</button>
                        <button
                          onClick={() => deleteTheme(t.id)}
                          style={{ padding: '3px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', background: 'white', color: 'var(--red)' }}
                        >Delete</button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {showAdd ? (
                <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{editingId ? 'Edit theme' : 'Add custom theme'}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Code (underscore_separated)</label>
                      <input
                        value={form.code}
                        onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                        placeholder="e.g. specialist_referral"
                        disabled={!!editingId}
                        style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Label</label>
                      <input
                        value={form.label}
                        onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                        placeholder="e.g. Specialist referral experience"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Description (guides Claude's coding)</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What should Claude look for in reviews to code this theme?"
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ marginBottom: 12, width: 120 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Sort order</label>
                    <input
                      type="number"
                      value={form.sort_order}
                      onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 99 }))}
                      style={inputStyle}
                    />
                  </div>
                  {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={saveTheme}
                      disabled={saving}
                      style={{ padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 6, border: 'none', background: saving ? 'var(--border)' : 'var(--accent)', color: saving ? 'var(--muted)' : '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}
                    >
                      {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add theme'}
                    </button>
                    <button
                      onClick={() => { setShowAdd(false); setEditingId(null); setForm({ code: '', label: '', description: '', sort_order: 99 }); setError('') }}
                      style={{ padding: '7px 12px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--muted)' }}
                    >Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setShowAdd(true); setEditingId(null); setForm({ code: '', label: '', description: '', sort_order: 99 }) }}
                  style={{ padding: '8px 14px', fontSize: 13, borderRadius: 7, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--accent-d)', width: '100%' }}
                >
                  + Add practice-specific theme
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--divider)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ReviewsTab ───────────────────────────────────────────────────────────
export default function ReviewsTab({ practiceId }: ReviewsTabProps) {
  const [scores, setScores] = useState<ThemeScore[]>([])
  const [themes, setThemes] = useState<ThemeDef[]>([])
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'trends' | 'upload' | 'manage'>('trends')
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([])
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)
  const [showCodebook, setShowCodebook] = useState(false)

  // Upload state
  const [uploadMode, setUploadMode] = useState<'csv' | 'paste' | 'screenshot'>('screenshot')
  const [uploadPeriod, setUploadPeriod] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [screenshots, setScreenshots] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [extractedReviews, setExtractedReviews] = useState<Array<{ text: string; rating: number; date: string }> | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [uploadSummary, setUploadSummary] = useState<{ summary: string; overall: Record<string, number | string> } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const screenshotRef = useRef<HTMLInputElement>(null)

  const fetchScores = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/reviews/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ practiceId }),
      })
      const data = await res.json()
      setScores(data.scores ?? [])
      setThemes(data.themes ?? [])
      setUploads(data.uploads ?? [])
      const periods = [...new Set((data.scores ?? []).map((s: ThemeScore) => s.period))].sort() as string[]
      setSelectedPeriods(periods)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [practiceId])

  useEffect(() => { fetchScores() }, [fetchScores])

  // Clipboard paste listener for screenshots
  useEffect(() => {
    if (view !== 'upload' || uploadMode !== 'screenshot') return

    function handlePaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageItems = items.filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return
      const files = imageItems
        .map(item => item.getAsFile())
        .filter((f): f is File => f !== null)
      if (files.length > 0) {
        setScreenshots(prev => [...prev, ...files])
        setExtractedReviews(null)
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [view, uploadMode])

  const allPeriods = [...new Set(scores.map(s => s.period))].sort()
  const sortedSelected = [...selectedPeriods].sort()
  const activeThemes = themes.filter(t => t.active)

  // ── Extract from screenshots ──────────────────────────────────────────────
  async function doExtract() {
    setExtracting(true)
    setUploadMsg(null)
    try {
      const images = await Promise.all(screenshots.map(async f => {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(f)
        })
        return { data, mediaType: f.type }
      }))

      const res = await fetch('/api/reviews/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setExtractedReviews(result.reviews)
    } catch (e) {
      setUploadMsg({ type: 'error', text: `Extraction failed: ${(e as Error).message}` })
    }
    setExtracting(false)
  }

  // ── Upload & analyse ──────────────────────────────────────────────────────
  async function doUpload() {
    if (!/^\d{4}Q[1-4]$/.test(uploadPeriod)) return
    setUploading(true)
    setUploadMsg(null)
    setUploadSummary(null)

    let reviews: Array<{ text: string; rating: number; date: string }> | null = null

    if (uploadMode === 'csv' && uploadFile) {
      const text = await uploadFile.text()
      reviews = parseReviewsCSV(text)
      if (!reviews) {
        setUploadMsg({ type: 'error', text: 'Could not parse CSV. Check the file has a review text column.' })
        setUploading(false)
        return
      }
    } else if (uploadMode === 'paste' && pasteText.trim()) {
      reviews = parsePastedReviews(pasteText)
      if (!reviews || reviews.length === 0) {
        setUploadMsg({ type: 'error', text: 'Could not detect any reviews. Try separating reviews with blank lines.' })
        setUploading(false)
        return
      }
    } else if (uploadMode === 'screenshot' && extractedReviews) {
      reviews = extractedReviews
    } else {
      setUploadMsg({ type: 'error', text: 'Please provide reviews via CSV, paste, or extract from screenshots first.' })
      setUploading(false)
      return
    }

    try {
      const res = await fetch('/api/reviews/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews, period: uploadPeriod, practiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')

      setUploadMsg({
        type: 'success',
        text: `${uploadPeriod} analysed — ${data.reviewCount} reviews coded across ${Object.keys(data.themes).length} themes.`,
      })
      setUploadSummary({ summary: data.summary, overall: data.overall })
      setUploadPeriod('')
      setUploadFile(null)
      setPasteText('')
      setScreenshots([])
      setExtractedReviews(null)
      if (fileRef.current) fileRef.current.value = ''
      await fetchScores()
      setTimeout(() => setView('trends'), 2000)
    } catch (e) {
      setUploadMsg({ type: 'error', text: (e as Error).message })
    }
    setUploading(false)
  }

  async function doDelete(period: string) {
    if (!confirm(`Delete reviews for ${period}? This cannot be undone.`)) return
    await fetch('/api/reviews/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ period, practiceId }),
    })
    await fetchScores()
  }

  function getScore(themeCode: string, period: string) {
    return scores.find(s => s.theme_code === themeCode && s.period === period)
  }

  const uploadReady = !/^\d{4}Q[1-4]$/.test(uploadPeriod)
    ? false
    : uploadMode === 'csv' ? !!uploadFile
    : uploadMode === 'paste' ? !!pasteText.trim()
    : !!extractedReviews

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--muted)' }}>
      Loading reviews…
    </div>
  )

  return (
    <div>
      {showCodebook && (
        <CodebookEditor
          practiceId={practiceId}
          onClose={() => { setShowCodebook(false); fetchScores() }}
        />
      )}

      {/* Sub-nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['trends', 'upload', 'manage'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                border: view === v ? '1px solid var(--border)' : '1px solid transparent',
                background: view === v ? 'var(--surface)' : 'transparent',
                color: view === v ? 'var(--text)' : 'var(--muted)',
                fontWeight: view === v ? 500 : 400,
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
              }}
            >
              {v === 'trends' ? 'Theme trends' : v === 'upload' ? '+ Upload reviews' : 'Manage'}
            </button>
          ))}
          <button
            onClick={() => setShowCodebook(true)}
            style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
              border: '1px solid transparent', background: 'transparent', color: 'var(--muted)',
            }}
          >
            Codebook ⚙
          </button>
        </div>

        {view === 'trends' && allPeriods.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Quarters:</span>
            {allPeriods.map(p => (
              <button
                key={p}
                onClick={() => {
                  if (selectedPeriods.includes(p) && selectedPeriods.length === 1) return
                  setSelectedPeriods(prev =>
                    prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
                  )
                }}
                style={{
                  padding: '3px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  borderWidth: selectedPeriods.includes(p) ? 1.5 : 1,
                  borderStyle: 'solid',
                  borderColor: selectedPeriods.includes(p) ? 'var(--accent)' : 'var(--border)',
                  background: selectedPeriods.includes(p) ? 'var(--accent-l)' : 'transparent',
                  color: selectedPeriods.includes(p) ? 'var(--accent-d)' : 'var(--muted)',
                  fontWeight: selectedPeriods.includes(p) ? 500 : 400,
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setSelectedPeriods(allPeriods)}
              style={{ padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)' }}
            >
              All
            </button>
          </div>
        )}
      </div>

      {/* ── TRENDS ── */}
      {view === 'trends' && (
        <div>
          {scores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⭐</div>
              <div style={{ fontSize: 15, marginBottom: 8 }}>No review data yet</div>
              <div style={{ fontSize: 13 }}>Upload your first quarterly Google Reviews to get started</div>
              <button
                onClick={() => setView('upload')}
                style={{ marginTop: 16, padding: '8px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
              >
                Upload reviews
              </button>
            </div>
          ) : (
            <>
{/* Single quarter summary card — most recent selected */}
{(() => {
  const latestPeriod = sortedSelected[sortedSelected.length - 1]
  const u = uploads.find(u => u.period === latestPeriod)
  if (!u) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '20px 24px', marginBottom: 20,
      borderLeft: `4px solid ${sentimentColor(u?.net_sentiment ?? 0)}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        {/* Left — period + headline metrics */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
            {u.period} · latest selected quarter
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: sentimentColor(u?.net_sentiment ?? 0), lineHeight: 1 }}>
              {(u?.net_sentiment ?? 0) > 0 ? '+' : ''}{u?.net_sentiment ?? 0}
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>net sentiment</div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {u?.avg_rating != null && (
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{u.avg_rating}★</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>avg rating</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{u.review_count}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>reviews</div>
            </div>
            {u?.positive_reviews != null && (
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1a7a35' }}>+{u.positive_reviews}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>positive</div>
              </div>
            )}
            {u?.negative_reviews != null && u.negative_reviews > 0 && (
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#b33030' }}>−{u.negative_reviews}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>negative</div>
              </div>
            )}
          </div>
        </div>
        {/* Right — summary text */}
        {u?.summary && (
          <div style={{
            flex: 1, minWidth: 240, fontSize: 13, color: 'var(--muted)',
            lineHeight: 1.7, fontStyle: 'italic', paddingTop: 4,
          }}>
            {u.summary}
          </div>
        )}
      </div>
    </div>
  )
})()}
              {/* Theme table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '5px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', minWidth: 180 }}>
                        Theme
                      </th>
                      {sortedSelected.map(p => {
                        const u = uploads.find(u => u.period === p)
                        return (
                          <th key={p} style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                            {p}
                            {u && (
                              <div style={{ fontSize: 10, fontWeight: 400, marginTop: 1 }}>
                                {u.review_count} reviews{u?.avg_rating != null ? ` · ${u.avg_rating}★` : ''}
                              </div>
                            )}
                          </th>
                        )
                      })}
                      <th style={{ padding: '5px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', minWidth: 160 }}>
                        Trend
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeThemes.map(theme => {
                      const vals = sortedSelected.map(p => getScore(theme.code, p)?.net_sentiment ?? 0)
                      const hasData = sortedSelected.some(p => getScore(theme.code, p) !== undefined)
                      return (
                        <tr
                          key={theme.code}
                          style={{ borderBottom: '1px solid var(--divider)', background: hoveredTheme === theme.code ? '#f2f1ee' : '' }}
                          onMouseEnter={() => setHoveredTheme(theme.code)}
                          onMouseLeave={() => setHoveredTheme(null)}
                        >
                          <td style={{ padding: '10px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 500 }}>{theme.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{theme.description}</div>
                          </td>
                          {sortedSelected.map(p => {
                            const score = getScore(theme.code, p)
                            if (!score) return (
                              <td key={p} style={{ padding: '10px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>—</td>
                            )
                            const net = score.net_sentiment
                            const col = sentimentColor(net)
                            return (
                              <td key={p} style={{ padding: '10px', textAlign: 'center', verticalAlign: 'top' }}>
                                <div style={{ fontSize: 18, fontWeight: 700, color: col, lineHeight: 1 }}>
                                  {net > 0 ? '+' : ''}{net}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
                                  +{score.positive_count} / −{score.negative_count}
                                </div>
                                {score.representative_quote && (
                                  <div style={{
                                    fontSize: 10, color: 'var(--muted)', fontStyle: 'italic',
                                    marginTop: 5, maxWidth: 130, margin: '5px auto 0', lineHeight: 1.4,
                                    opacity: hoveredTheme === theme.code ? 1 : 0,
                                    transition: 'opacity 0.15s',
                                  }}>
                                    &ldquo;{score.representative_quote}&rdquo;
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          <td style={{ padding: '10px', verticalAlign: 'middle', minWidth: 160 }}>
                            {hasData
                              ? <Sparkline vals={vals} w={100} h={28} />
                              : <span style={{ fontSize: 11, color: 'var(--muted)' }}>no data</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── UPLOAD ── */}
      {view === 'upload' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>Upload Google Reviews</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
            Provide reviews via screenshot, CSV, or paste. Claude will extract and code each review against your active theme codebook.
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Quarter period</label>
            <input
              value={uploadPeriod}
              onChange={e => setUploadPeriod(e.target.value.toUpperCase())}
              placeholder="e.g. 2026Q2"
              style={{ padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 7, width: '100%', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Format: 2026Q1 / 2026Q2 / 2026Q3 / 2026Q4</div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
            {(['screenshot', 'paste', 'csv'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setUploadMode(m); setUploadMsg(null) }}
                style={{
                  padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                  border: uploadMode === m ? '1px solid var(--border)' : '1px solid transparent',
                  background: uploadMode === m ? 'var(--surface)' : 'transparent',
                  color: uploadMode === m ? 'var(--text)' : 'var(--muted)',
                  fontWeight: uploadMode === m ? 500 : 400,
                  boxShadow: uploadMode === m ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
                }}
              >
                {m === 'screenshot' ? '📷 Screenshots' : m === 'paste' ? 'Paste text' : 'CSV file'}
              </button>
            ))}
          </div>

          {/* SCREENSHOT MODE */}
          {uploadMode === 'screenshot' && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>
                Take screenshots of your Google reviews page and upload them here — or press Ctrl+V to paste directly from clipboard
              </label>
              <div
                onClick={() => screenshotRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = 'var(--border)'
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
                  setScreenshots(prev => [...prev, ...files])
                  setExtractedReviews(null)
                }}
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer' }}
              >
                {screenshots.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>
                      {screenshots.length} screenshot{screenshots.length !== 1 ? 's' : ''} selected
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Click to add more · or Ctrl+V to paste</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>Drop screenshots here, click to browse, or <strong>Ctrl+V to paste</strong></div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>PNG or JPG — upload multiple to capture all reviews</div>
                  </div>
                )}
              </div>
              <input
                ref={screenshotRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  setScreenshots(prev => [...prev, ...files])
                  setExtractedReviews(null)
                }}
              />

              {/* Thumbnails */}
              {screenshots.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {screenshots.map((f, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img
                        src={URL.createObjectURL(f)}
                        alt={`screenshot ${i + 1}`}
                        style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                      />
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          setScreenshots(prev => prev.filter((_, j) => j !== i))
                          setExtractedReviews(null)
                        }}
                        style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Extract button */}
              {screenshots.length > 0 && !extractedReviews && (
                <button
                  onClick={doExtract}
                  disabled={extracting}
                  style={{ marginTop: 12, padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 7, border: 'none', background: extracting ? 'var(--border)' : '#1a4a7a', color: extracting ? 'var(--muted)' : '#fff', cursor: extracting ? 'not-allowed' : 'pointer' }}
                >
                  {extracting ? 'Extracting reviews from screenshots…' : `Extract reviews from ${screenshots.length} screenshot${screenshots.length !== 1 ? 's' : ''}`}
                </button>
              )}

              {/* Extracted preview */}
              {extractedReviews && (
                <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--accent-l)', borderRadius: 8, border: '1px solid #b2dfc2' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-d)', marginBottom: 8 }}>
                    ✓ Extracted {extractedReviews.length} reviews — ready to analyse
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {extractedReviews.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '7px 10px', background: 'white', borderRadius: 6, border: '1px solid #b2dfc2' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                          {r.date && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.date}</span>}
                        </div>
                        <div style={{ color: '#333', lineHeight: 1.4 }}>{r.text.slice(0, 140)}{r.text.length > 140 ? '…' : ''}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { setExtractedReviews(null); setScreenshots([]) }}
                    style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear and start again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PASTE MODE */}
          {uploadMode === 'paste' && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>
                Paste review text — separate reviews with a blank line. Include star rating if possible.
              </label>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder={`5/5 — January 2026\nDr Jaunay was exceptional. The procedure was explained clearly and I felt completely at ease throughout.\n\n4/5 — February 2026\nVery professional practice. Slight wait at reception but the clinical care was outstanding.`}
                rows={10}
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', resize: 'vertical', lineHeight: 1.5 }}
              />
              {pasteText && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Detected ~{parsePastedReviews(pasteText).length} reviews
                </div>
              )}
            </div>
          )}

          {/* CSV MODE */}
          {uploadMode === 'csv' && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>
                CSV file — needs a column containing review text. Rating and date columns are optional but helpful.
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
                onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.style.borderColor = 'var(--border)'
                  const f = e.dataTransfer.files[0]
                  if (f) setUploadFile(f)
                }}
                style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer' }}
              >
                {uploadFile ? (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>{uploadFile.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{(uploadFile.size / 1024).toFixed(1)} KB · click to change</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                    <div style={{ fontSize: 14, color: 'var(--muted)' }}>Drop CSV here or click to browse</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={doUpload}
            disabled={uploading || !uploadReady}
            style={{
              width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none',
              cursor: uploading || !uploadReady ? 'not-allowed' : 'pointer',
              background: uploading || !uploadReady ? 'var(--border)' : 'var(--accent)',
              color: uploading || !uploadReady ? 'var(--muted)' : '#fff',
            }}
          >
            {uploading ? 'Analysing with Claude…' : 'Upload & analyse'}
          </button>

          {uploading && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Claude is coding each review against the theme codebook — this may take 15–30 seconds…
            </div>
          )}

          {uploadMsg && (
            <div style={{
              marginTop: 14, padding: '12px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
              background: uploadMsg.type === 'success' ? 'var(--accent-l)' : 'var(--red-l)',
              color: uploadMsg.type === 'success' ? 'var(--accent-d)' : 'var(--red)',
              border: `1px solid ${uploadMsg.type === 'success' ? '#b2dfc2' : '#f0c0c0'}`,
            }}>
              {uploadMsg.text}
            </div>
          )}

          {uploadSummary && uploadSummary.summary && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ padding: '14px 16px', borderRadius: 8, background: 'var(--blue-l)', color: 'var(--blue)', fontSize: 13, lineHeight: 1.6, border: '1px solid #b5d4f4' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Quarter summary</div>
                {uploadSummary.summary}
              </div>
              {uploadSummary.overall && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Avg rating', value: uploadSummary.overall.avg_rating != null ? `${uploadSummary.overall.avg_rating}★` : 'N/A' },
                    { label: 'Positive', value: `+${uploadSummary.overall.positive_reviews ?? 0}` },
                    { label: 'Negative', value: `−${uploadSummary.overall.negative_reviews ?? 0}` },
                    { label: 'Net sentiment', value: `${Number(uploadSummary.overall.net_sentiment ?? 0) > 0 ? '+' : ''}${uploadSummary.overall.net_sentiment ?? 0}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MANAGE ── */}
      {view === 'manage' && (
        <div style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Uploaded review quarters</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
            {uploads.length} quarter{uploads.length !== 1 ? 's' : ''} analysed
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {uploads.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>No uploads yet.</div>
            )}
            {uploads.map(u => (
              <div key={u.period} style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', gap: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, minWidth: 70 }}>{u.period}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {u.review_count} reviews · net {(u?.net_sentiment ?? 0) > 0 ? '+' : ''}{u?.net_sentiment ?? 0}
                    {u?.avg_rating != null ? ` · ${u.avg_rating}★` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Uploaded {new Date(u.uploaded_at).toLocaleDateString('en-AU')}
                  </div>
                </div>
                <button
                  onClick={() => doDelete(u.period)}
                  style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--muted)' }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
