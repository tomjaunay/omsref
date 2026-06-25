'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import AskClaude from './AskClaude'
import Sparkline from './Sparkline'
import ChangePill from './ChangePill'
import {
  type RawRow, type Metric, type DashTab, type SortDir, type SortOption,
  PRAC_SORTS, DENT_SORTS, TREND_BANDS,
  fmt$, fmtK, complexity, sortPeriods,
  buildPracticeTable, buildDentistTable,
  metricVal, metricFmt, metricLabel,
  buildClaudeContext,
} from '@/lib/data'

// ── Shared style tokens ────────────────────────────────────────────────────────
const S = {
  tabBtn: (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
    border: active ? '1px solid var(--border)' : '1px solid transparent',
    background: active ? 'var(--surface)' : 'transparent',
    color: active ? 'var(--text)' : 'var(--muted)',
    fontWeight: active ? 500 : 400,
    boxShadow: active ? '0 1px 3px rgba(0,0,0,.06)' : 'none',
  }),
  segBtn: (active: boolean): React.CSSProperties => ({
    padding: '4px 11px', fontSize: 12, borderRadius: 5, cursor: 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--text)' : 'transparent',
    color: active ? '#fff' : 'var(--muted)',
  }),
  th: {
    padding: '5px 10px', textAlign: 'left' as const, color: 'var(--muted)',
    fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)',
    whiteSpace: 'nowrap' as const, cursor: 'pointer', userSelect: 'none' as const,
  },
  td: { padding: '7px 10px', borderBottom: '1px solid var(--divider)', verticalAlign: 'middle' as const },
  tdNum: { padding: '7px 10px', borderBottom: '1px solid var(--divider)', verticalAlign: 'middle' as const, textAlign: 'right' as const, fontFamily: 'var(--font-mono)', fontSize: 12 },
}

// ── Sort button ────────────────────────────────────────────────────────────────
function SortButton({ dir, onClick }: { dir: SortDir; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={dir === 'desc' ? 'Descending — click to reverse' : 'Ascending — click to reverse'}
      style={{
        width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)',
        background: 'var(--surface)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
      }}
    >
      {dir === 'desc' ? '↓' : '↑'}
    </button>
  )
}

// ── Upload tab ─────────────────────────────────────────────────────────────────
function UploadTab({ onSuccess }: { onSuccess: () => void }) {
  const [period, setPeriod] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const valid = /^\d{4}Q[1-4]$/.test(period) && !!file

  async function doUpload() {
    if (!valid) return
    setUploading(true)
    setMsg(null)
    try {
      const csvText = await file!.text()
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, csvText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setMsg({ type: 'success', text: `${period} saved — ${data.referrers} referrers, ${data.referrals} referrals, ${fmt$(data.income)} income.` })
      setPeriod('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onSuccess()
    } catch (e) {
      setMsg({ type: 'error', text: (e as Error).message })
    }
    setUploading(false)
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 5 }}>Upload quarterly report</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          Export the <strong>Referrer Details</strong> report from Gentu filtered to a single quarter, then upload it here.
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>Quarter period</label>
        <input
          value={period}
          onChange={e => setPeriod(e.target.value.toUpperCase())}
          placeholder="e.g. 2026Q3"
          style={{ padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 7, width: '100%', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}
        />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Format: 2026Q1 / 2026Q2 / 2026Q3 / 2026Q4</div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>CSV file (Referrer Details export)</label>
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-l)' }}
          onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '' }}
          onDrop={e => {
            e.preventDefault()
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.background = ''
            const f = e.dataTransfer.files[0]
            if (f) setFile(f)
          }}
          style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 28, textAlign: 'center', cursor: 'pointer' }}
        >
          {file ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent)' }}>{file.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · click to change</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 14, color: 'var(--muted)' }}>Drop CSV here or click to browse</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>Referral_Report_-_Referrer_Details….csv</div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </div>

      <button
        onClick={doUpload}
        disabled={uploading || !valid}
        style={{
          width: '100%', padding: 10, fontSize: 14, fontWeight: 600, borderRadius: 8,
          cursor: uploading || !valid ? 'not-allowed' : 'pointer',
          background: uploading || !valid ? 'var(--border)' : 'var(--accent)',
          color: uploading || !valid ? 'var(--muted)' : '#fff',
          border: 'none',
        }}
      >
        {uploading ? 'Saving…' : 'Save to database'}
      </button>

      {msg && (
        <div style={{
          marginTop: 14, padding: '12px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
          background: msg.type === 'success' ? 'var(--accent-l)' : 'var(--red-l)',
          color: msg.type === 'success' ? 'var(--accent-d)' : 'var(--red)',
          border: `1px solid ${msg.type === 'success' ? '#b2dfc2' : '#f0c0c0'}`,
        }}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

// ── Manage tab ─────────────────────────────────────────────────────────────────
function ManageTab({
  db, periods, onDeleted
}: {
  db: Record<string, RawRow[]>
  periods: string[]
  onDeleted: () => void
}) {
async function del(p: string) {
  if (!confirm(`Delete ${p}? This cannot be undone.`)) return
  await fetch('/api/delete-period', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period: p }),
  })
  onDeleted()
}

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Stored quarters</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
        {periods.length} quarter{periods.length !== 1 ? 's' : ''} in database
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {periods.map(p => {
          const rows = db[p] ?? []
          const refs = rows.reduce((s, r) => s + r.referrals, 0)
          const inc = rows.reduce((s, r) => s + r.income, 0)
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 16px', gap: 16 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 14, minWidth: 70 }}>{p}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{refs} referrals · {fmt$(inc)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{rows.length} referrers · avg {fmt$(complexity(refs, inc))}/ref</div>
              </div>
              <button
                onClick={() => del(p)}
                style={{ padding: '4px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: 'var(--muted)' }}
              >
                Delete
              </button>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 22, padding: '12px 14px', borderRadius: 8, background: 'var(--blue-l)', color: 'var(--blue)', fontSize: 12, lineHeight: 1.6 }}>
        <strong>Storage:</strong> Data is stored in Supabase (PostgreSQL) and shared across all users.
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [db, setDb] = useState<Record<string, RawRow[]>>({})
  const [allPeriods, setAllPeriods] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [mainTab, setMainTab] = useState<'dashboard' | 'upload' | 'manage'>('dashboard')
  const [dashTab, setDashTab] = useState<DashTab>('practices')
  const [metric, setMetric] = useState<Metric>('refs')

  const [pracSort, setPracSort] = useState('totalRefs')
  const [pracDir, setPracDir] = useState<SortDir>('desc')
  const [dentSort, setDentSort] = useState('totalRefs')
  const [dentDir, setDentDir] = useState<SortDir>('desc')

  const [pracSearch, setPracSearch] = useState('')
  const [dentSearch, setDentSearch] = useState('')

const fetchData = useCallback(async () => {
  try {
    const res = await fetch('/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    setDb(data.db ?? {})
    setAllPeriods(data.periods ?? [])
    setSelected(data.periods ?? [])
  } catch (e) {
    console.error('Failed to fetch data:', e)
  }
  setLoading(false)
}, [])

  useEffect(() => { fetchData() }, [fetchData])

  const sortedSelected = sortPeriods(selected)
  const currentSorts: SortOption[] = dashTab === 'practices' ? PRAC_SORTS : DENT_SORTS
  const currentSort = dashTab === 'practices' ? pracSort : dentSort
  const currentDir = dashTab === 'practices' ? pracDir : dentDir

  function setSort(key: string) {
    if (dashTab === 'practices') setPracSort(key)
    else setDentSort(key)
  }
  function toggleDir() {
    if (dashTab === 'practices') setPracDir(d => d === 'desc' ? 'asc' : 'desc')
    else setDentDir(d => d === 'desc' ? 'asc' : 'desc')
  }

  const pracData = buildPracticeTable(db, sortedSelected, pracSort, pracDir)
    .filter(p => !pracSearch || p.practice.toLowerCase().includes(pracSearch.toLowerCase()))
  const dentData = buildDentistTable(db, sortedSelected, dentSort, dentDir)
    .filter(d => !dentSearch || d.referrer.toLowerCase().includes(dentSearch.toLowerCase()) || d.practice.toLowerCase().includes(dentSearch.toLowerCase()))

  const claudeContext = buildClaudeContext(db, allPeriods)
  const ml = metricLabel(metric)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
      Loading…
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--divider)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.3px' }}>OMFS Referral Analytics</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            {allPeriods.length > 0 ? `${allPeriods[0]} – ${allPeriods[allPeriods.length - 1]}` : 'no data'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['dashboard', 'upload', 'manage'] as const).map(t => (
            <button key={t} style={S.tabBtn(mainTab === t)} onClick={() => setMainTab(t)}>
              {t === 'dashboard' ? 'Dashboard' : t === 'upload' ? '+ Upload quarter' : 'Manage data'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 24px' }}>

        {/* Ask Claude — always visible */}
        <AskClaude systemPrompt={claudeContext} />

        {/* DASHBOARD */}
        {mainTab === 'dashboard' && (
          <div>
            {allPeriods.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 15, marginBottom: 8 }}>No data yet</div>
                <div style={{ fontSize: 13 }}>Upload your first quarterly report to get started</div>
                <button onClick={() => setMainTab('upload')} style={{ marginTop: 16, padding: '8px 20px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>
                  Upload now
                </button>
              </div>
            ) : (
              <>
                {/* Quarter cards */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(allPeriods.length, 6)}, 1fr)`, gap: 10, marginBottom: 20 }}>
                  {allPeriods.map(p => {
                    const rows = db[p] ?? []
                    const refs = rows.reduce((s, r) => s + r.referrals, 0)
                    const inc = rows.reduce((s, r) => s + r.income, 0)
                    const active = selected.includes(p)
                    return (
                      <div
                        key={p}
                        onClick={() => {
                          if (active && selected.length === 1) return
                          setSelected(prev => active ? prev.filter(x => x !== p) : sortPeriods([...prev, p]))
                        }}
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '13px 16px', borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>{p}</div>
                        <div style={{ fontSize: 19, fontWeight: 600 }}>{refs}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{fmtK(inc)} · avg {fmt$(complexity(refs, inc))}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Period selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 2 }}>Quarters:</span>
                  {allPeriods.map(p => (
                    <button
                      key={p}
                      onClick={() => {
                        if (selected.includes(p) && selected.length === 1) return
                        setSelected(prev => selected.includes(p) ? prev.filter(x => x !== p) : sortPeriods([...prev, p]))
                      }}
                      style={{
                        padding: '3px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        borderWidth: selected.includes(p) ? 1.5 : 1,
                        borderStyle: 'solid',
                        borderColor: selected.includes(p) ? 'var(--accent)' : 'var(--border)',
                        background: selected.includes(p) ? 'var(--accent-l)' : 'transparent',
                        color: selected.includes(p) ? 'var(--accent-d)' : 'var(--muted)',
                        fontWeight: selected.includes(p) ? 500 : 400,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelected(allPeriods)}
                    style={{ padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', marginLeft: 4 }}
                  >
                    All
                  </button>
                </div>

                {/* Controls row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  {/* Sub-tabs */}
                  <div style={{ display: 'flex', gap: 3 }}>
                    {(['practices', 'dentists'] as const).map(t => (
                      <button key={t} style={S.tabBtn(dashTab === t)} onClick={() => setDashTab(t)}>
                        {t === 'practices' ? `Practices (${pracData.length})` : `Dentists (${dentData.length})`}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {/* Metric */}
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginRight: 2 }}>Show:</span>
                      {(['refs', 'income', 'complexity'] as Metric[]).map(m => (
                        <button key={m} style={S.segBtn(metric === m)} onClick={() => {
                          setMetric(m)
                          if (m === 'complexity') {
                            if (dashTab === 'practices') setPracSort('totalComplex')
                            else setDentSort('totalComplex')
                          }
                        }}>
                          {m === 'refs' ? 'Referrals' : m === 'income' ? 'Income' : 'Complexity'}
                        </button>
                      ))}
                    </div>

                    {/* Sort selector + direction */}
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sort:</span>
                      <select
                        value={currentSort}
                        onChange={e => setSort(e.target.value)}
                        style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', color: 'var(--text)' }}
                      >
                        {currentSorts.map(o => (
                          <option key={o.val} value={o.val}>{o.label}</option>
                        ))}
                      </select>
                      <SortButton dir={currentDir} onClick={toggleDir} />
                    </div>

                    {/* Trend legend */}
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {TREND_BANDS.map(b => (
                        <span key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)' }}>
                          <span style={{ display: 'inline-block', width: 20, height: 2.5, borderRadius: 2, background: b.swatch }} />
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* PRACTICES TABLE */}
                {dashTab === 'practices' && (
                  <div>
                    <input
                      value={pracSearch}
                      onChange={e => setPracSearch(e.target.value)}
                      placeholder="Search practice…"
                      style={{ marginBottom: 12, padding: '7px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, width: 280, background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={S.th}>#</th>
                            <th style={S.th}>Practice</th>
                            {sortedSelected.map(p => (
                              <th key={p} style={{ ...S.th, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{p}</th>
                            ))}
                            <th style={{ ...S.th, textAlign: 'right', color: 'var(--accent-d)' }}>Total {ml}</th>
                            <th style={{ ...S.th, minWidth: 180 }}>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pracData.map((p, i) => {
                            const vals = sortedSelected.map(period => {
                              const pd = p.pd[period] ?? { refs: 0, inc: 0 }
                              return metricVal(metric, pd.refs, pd.inc)
                            })
                            const tot = metricVal(metric, p.totalRefs, p.totalIncome)
                            return (
                              <tr key={p.practice} style={{ borderBottom: '1px solid var(--divider)' }}
                                onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '#f2f1ee'))}
                                onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => (c.style.background = ''))}>
                                <td style={{ ...S.td, color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                                <td style={{ ...S.td, fontWeight: 500, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.practice}</td>
                                {vals.map((v, vi) => (
                                  <td key={vi} style={{ ...S.tdNum, color: v === 0 ? 'var(--muted)' : 'var(--text)' }}>{metricFmt(metric, v)}</td>
                                ))}
                                <td style={{ ...S.tdNum, fontWeight: 600 }}>{metricFmt(metric, tot)}</td>
                                <td style={S.td}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <Sparkline vals={vals} />
                                    <ChangePill vals={vals} />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* DENTISTS TABLE */}
                {dashTab === 'dentists' && (
                  <div>
                    <input
                      value={dentSearch}
                      onChange={e => setDentSearch(e.target.value)}
                      placeholder="Search dentist or practice…"
                      style={{ marginBottom: 12, padding: '7px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, width: 280, background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={S.th}>#</th>
                            <th style={S.th}>Dentist</th>
                            <th style={S.th}>Practice</th>
                            {sortedSelected.map(p => (
                              <th key={p} style={{ ...S.th, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{p}</th>
                            ))}
                            <th style={{ ...S.th, textAlign: 'right', color: 'var(--accent-d)' }}>Total {ml}</th>
                            <th style={{ ...S.th, minWidth: 180 }}>Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dentData.map((d, i) => {
                            const vals = sortedSelected.map(period => {
                              const pd = d.pd[period] ?? { refs: 0, inc: 0 }
                              return metricVal(metric, pd.refs, pd.inc)
                            })
                            const tot = metricVal(metric, d.totalRefs, d.totalIncome)
                            const isOrtho = d.specialty === 'Orthodontist'
                            return (
                              <tr key={`${d.referrer}||${d.practice}`} style={{ borderBottom: '1px solid var(--divider)' }}
                                onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => (c.style.background = '#f2f1ee'))}
                                onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => (c.style.background = ''))}>
                                <td style={{ ...S.td, color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                                <td style={{ ...S.td, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                  {d.referrer}
                                  {isOrtho && (
                                    <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--amber-l)', color: 'var(--amber)', padding: '1px 5px', borderRadius: 4, fontWeight: 500 }}>Ortho</span>
                                  )}
                                </td>
                                <td style={{ ...S.td, color: 'var(--muted)', fontSize: 12, maxWidth: 170, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.practice}</td>
                                {vals.map((v, vi) => (
                                  <td key={vi} style={{ ...S.tdNum, color: v === 0 ? 'var(--muted)' : 'var(--text)' }}>{metricFmt(metric, v)}</td>
                                ))}
                                <td style={{ ...S.tdNum, fontWeight: 600 }}>{metricFmt(metric, tot)}</td>
                                <td style={S.td}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <Sparkline vals={vals} />
                                    <ChangePill vals={vals} />
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* UPLOAD */}
        {mainTab === 'upload' && (
          <UploadTab onSuccess={() => { fetchData(); setMainTab('dashboard') }} />
        )}

        {/* MANAGE */}
        {mainTab === 'manage' && (
          <ManageTab db={db} periods={allPeriods} onDeleted={fetchData} />
        )}
      </div>
    </div>
  )
}
