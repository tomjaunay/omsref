'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Sparkline from './Sparkline'

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
  code: string
  label: string
  description: string
  sort_order: number
}

interface UploadRecord {
  period: string
  review_count: number
  uploaded_at: string
}

interface ReviewsTabProps {
  practiceId?: string
}

function parseGoogleReviewsCSV(text: string): Array<{ text: string; rating: number; date: string }> | null {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return null

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  const reviewerIdx = headers.findIndex(h => h.includes('reviewer') || h.includes('name'))
  const ratingIdx = headers.findIndex(h => h.includes('rating') || h.includes('star'))
  const textIdx = headers.findIndex(h => h.includes('text') || h.includes('comment') || h.includes('review') || h.includes('body'))
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

    const text = (cells[textIdx] ?? '').replace(/^"|"$/g, '').trim()
    if (!text) continue

    const rating = ratingIdx >= 0 ? parseInt(cells[ratingIdx] ?? '5') || 5 : 5
    const date = dateIdx >= 0 ? (cells[dateIdx] ?? '').replace(/^"|"$/g, '').trim() : ''
    rows.push({ text, rating, date })
  }

  return rows.length > 0 ? rows : null
}

const SENTIMENT_COLORS = {
  positive: '#1a7a35',
  negative: '#b33030',
  neutral: '#c89a00',
}

const ACTIVITY_TYPE_COLORS: Record<string, string> = {
  visit: '#1a4a7a',
  EDM: '#1a6b3c',
  event: '#7a3a8a',
  gift: '#b35d00',
  educational: '#1a6b7a',
  digital: '#3a3a8a',
  other: '#7a7870',
}

export default function ReviewsTab({ practiceId }: ReviewsTabProps) {
  const [scores, setScores] = useState<ThemeScore[]>([])
  const [themes, setThemes] = useState<ThemeDef[]>([])
  const [uploads, setUploads] = useState<UploadRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadPeriod, setUploadPeriod] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [view, setView] = useState<'trends' | 'upload' | 'manage'>('trends')
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([])
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [practiceId])

  useEffect(() => { fetchScores() }, [fetchScores])

  const allPeriods = [...new Set(scores.map(s => s.period))].sort()
  const sortedSelected = [...selectedPeriods].sort()

  async function doUpload() {
    if (!uploadFile || !/^\d{4}Q[1-4]$/.test(uploadPeriod)) return
    setUploading(true)
    setUploadMsg(null)
    setSummary(null)

    try {
      const text = await uploadFile.text()
      const reviews = parseGoogleReviewsCSV(text)
      if (!reviews) {
        setUploadMsg({ type: 'error', text: 'Could not parse CSV. Make sure it is a Google Business Profile review export.' })
        setUploading(false)
        return
      }

      const res = await fetch('/api/reviews/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviews, period: uploadPeriod, practiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')

      setUploadMsg({ type: 'success', text: `${uploadPeriod} analysed — ${data.reviewCount} reviews coded across ${Object.keys(data.themes).length} themes.` })
      setSummary(data.summary)
      setUploadPeriod('')
      setUploadFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await fetchScores()
      setView('trends')
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

  function getScore(themeCode: string, period: string): ThemeScore | undefined {
    return scores.find(s => s.theme_code === themeCode && s.period === period)
  }

  function netSentimentVals(themeCode: string): number[] {
    return sortedSelected.map(p => getScore(themeCode, p)?.net_sentiment ?? 0)
  }

  function sentimentColor(net: number): string {
    if (net > 0) return SENTIMENT_COLORS.positive
    if (net < 0) return SENTIMENT_COLORS.negative
    return SENTIMENT_COLORS.neutral
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--muted)' }}>
      Loading reviews…
    </div>
  )

  return (
    <div>
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
        </div>
        {allPeriods.length > 0 && view === 'trends' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Quarters:</span>
            {allPeriods.map(p => (
              <button
                key={p}
                onClick={() => {
                  if (selectedPeriods.includes(p) && selectedPeriods.length === 1) return
                  setSelectedPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
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

      {/* TRENDS VIEW */}
      {view === 'trends' && (
        <div>
          {scores.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⭐</div>
              <div style={{ fontSize: 15, marginBottom: 8 }}>No review data yet</div>
              <div style={{ fontSize: 13 }}>Upload your first quarterly Google Reviews export to get started</div>
              <button
                onClick={() => setView('upload')}
                style={{ marginTop: 16, padding: '8px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
              >
                Upload reviews
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                {Object.entries(SENTIMENT_COLORS).map(([k, v]) => (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: v }} />
                    {k.charAt(0).toUpperCase() + k.slice(1)} net sentiment
                  </span>
                ))}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '5px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', whiteSpace: 'nowrap', minWidth: 180 }}>Theme</th>
                    {sortedSelected.map(p => (
                      <th key={p} style={{ padding: '5px 10px', textAlign: 'center', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {p}
                        <div style={{ fontSize: 10, fontWeight: 400, marginTop: 1 }}>
                          {uploads.find(u => u.period === p)?.review_count ?? 0} reviews
                        </div>
                      </th>
                    ))}
                    <th style={{ padding: '5px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', minWidth: 160 }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {themes.map(theme => {
                    const vals = netSentimentVals(theme.code)
                    const hasData = vals.some(v => v !== 0)
                    return (
                      <tr
                        key={theme.code}
                        style={{ borderBottom: '1px solid var(--divider)', background: hoveredTheme === theme.code ? '#f2f1ee' : '' }}
                        onMouseEnter={() => setHoveredTheme(theme.code)}
                        onMouseLeave={() => setHoveredTheme(null)}
                      >
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 500 }}>{theme.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{theme.description}</div>
                        </td>
                        {sortedSelected.map(p => {
                          const score = getScore(theme.code, p)
                          if (!score) return (
                            <td key={p} style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>—</td>
                          )
                          const net = score.net_sentiment
                          return (
                            <td key={p} style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                              <div style={{ fontSize: 16, fontWeight: 600, color: sentimentColor(net), lineHeight: 1 }}>
                                {net > 0 ? '+' : ''}{net}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                +{score.positive_count} / -{score.negative_count}
                              </div>
                              {score.representative_quote && hoveredTheme === theme.code && (
                                <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', marginTop: 4, maxWidth: 120, margin: '4px auto 0' }}>
                                  &ldquo;{score.representative_quote}&rdquo;
                                </div>
                              )}
                            </td>
                          )
                        })}
                        <td style={{ padding: '8px 10px', verticalAlign: 'middle', minWidth: 160 }}>
                          {hasData ? (
                            <Sparkline vals={vals} w={100} h={28} />
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>no data</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* UPLOAD VIEW */}
      {view === 'upload' && (
        <div style={{ maxWidth: 520 }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>Upload Google Reviews</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Export your reviews from <strong>Google Business Profile</strong> → Reviews → Download. 
              Claude will automatically code each review against the theme codebook.
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Quarter period</label>
            <input
              value={uploadPeriod}
              onChange={e => setUploadPeriod(e.target.value.toUpperCase())}
              placeholder="e.g. 2026Q2"
              style={{ padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 7, width: '100%', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>CSV file (Google Business Profile export)</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
              onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; const f = e.dataTransfer.files[0]; if (f) setUploadFile(f) }}
              style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer' }}
            >
              {uploadFile ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>{uploadFile.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{(uploadFile.size / 1024).toFixed(1)} KB · click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
                  <div style={{ fontSize: 14, color: 'var(--muted)' }}>Drop CSV here or click to browse</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Google_Business_Profile_reviews.csv</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
          </div>

          <button
            onClick={doUpload}
            disabled={uploading || !uploadFile || !/^\d{4}Q[1-4]$/.test(uploadPeriod)}
            style={{
              width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none',
              cursor: uploading || !uploadFile || !/^\d{4}Q[1-4]$/.test(uploadPeriod) ? 'not-allowed' : 'pointer',
              background: uploading || !uploadFile || !/^\d{4}Q[1-4]$/.test(uploadPeriod) ? 'var(--border)' : 'var(--accent)',
              color: uploading || !uploadFile || !/^\d{4}Q[1-4]$/.test(uploadPeriod) ? 'var(--muted)' : '#fff',
            }}
          >
            {uploading ? 'Analysing with Claude…' : 'Upload & analyse'}
          </button>

          {uploading && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
              Claude is reading and coding each review — this may take 15–30 seconds…
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

          {summary && (
            <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 8, background: 'var(--blue-l)', color: 'var(--blue)', fontSize: 13, lineHeight: 1.6, border: '1px solid #b5d4f4' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Quarter summary</div>
              {summary}
            </div>
          )}
        </div>
      )}

      {/* MANAGE VIEW */}
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
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.review_count} reviews analysed</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Uploaded {new Date(u.uploaded_at).toLocaleDateString('en-AU')}</div>
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