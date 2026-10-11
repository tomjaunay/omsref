'use client'
import { useEffect, useMemo, useState } from 'react'
import { parseGentuCSV } from '@/lib/data'
import { GENTU_ORIGIN, type GentuCsvMessage } from '@/lib/gentuBookmarklet'

// Receiver window for the "Pull from Gentu" bookmarklet. Gets the Referrer Details
// CSV from the Gentu tab via postMessage (or a dropped file), previews the totals,
// and saves it as a quarter through /api/upload once the user confirms.

function lastCompleteQuarter(d = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) // current quarter index 0–3
  return q === 0 ? `${d.getFullYear() - 1}Q4` : `${d.getFullYear()}Q${q}`
}
const fmt$ = (n: number) => n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

export default function GentuReceive() {
  const [csv, setCsv] = useState<string | null>(null)
  const [how, setHow] = useState('')
  const [period, setPeriod] = useState(lastCompleteQuarter())
  const [existing, setExisting] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [practiceId, setPracticeId] = useState<string | undefined>()
  const [notGentu, setNotGentu] = useState(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setPracticeId(p.get('practiceId') ?? undefined)
    setNotGentu(p.get('hint') === 'notgentu')

    const onMsg = (e: MessageEvent) => {
      if (!GENTU_ORIGIN.test(e.origin)) return
      const d = e.data as GentuCsvMessage
      if (!d || d.type !== 'omsref-gentu-csv' || typeof d.csv !== 'string') return
      setCsv(d.csv); setHow(`from Gentu (${d.how})`); setMsg(null); setNotGentu(false)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Quarters already in the database (to warn before replacing)
  useEffect(() => {
    fetch('/api/periods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ practiceId }) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setExisting(Array.isArray(d.periods) ? d.periods : [])
      })
      .catch(() => {})
  }, [practiceId])

  const rows = useMemo(() => (csv ? parseGentuCSV(csv) : null), [csv])
  const totals = rows ? {
    referrers: rows.length,
    referrals: rows.reduce((s, r) => s + r.referrals, 0),
    income: rows.reduce((s, r) => s + r.income, 0),
    practices: new Set(rows.map(r => r.practice).filter(Boolean)).size,
  } : null
  const validPeriod = /^\d{4}Q[1-4]$/.test(period)
  const replacing = existing.includes(period)

  async function save() {
    if (!csv || !rows || !validPeriod) return
    if (replacing && !confirm(`${period} is already in omsref. Replace it with this export?`)) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, csvText: csv, practiceId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? `Save failed (${res.status})`)
      setMsg({ type: 'success', text: `${period} saved — ${d.referrers} referrers, ${d.referrals} referrals, ${fmt$(d.income)}. You can close this window.` })
      setExisting(e => [...new Set([...e, period])])
      if (window.opener) { try { window.opener.postMessage({ type: 'omsref-gentu-saved', period }, '*') } catch {} }
    } catch (e) { setMsg({ type: 'error', text: (e as Error).message }) }
    setSaving(false)
  }

  function onDrop(f: File | undefined) {
    if (!f) return
    f.text().then(t => { setCsv(t); setHow(`from file ${f.name}`); setMsg(null) })
  }

  const box: React.CSSProperties = { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e0db)', borderRadius: 10, padding: 16, marginBottom: 14 }

  return (
    <main style={{ maxWidth: 520, margin: '24px auto', padding: '0 16px', fontSize: 14, lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Pull from Gentu</h1>
      <div style={{ color: 'var(--muted, #777)', fontSize: 13, marginBottom: 16 }}>
        Keep this window open. In the Gentu tab, run <b>Reports → Referral Report → Referrer Details</b> for one quarter and click export.
        The CSV arrives here automatically.
      </div>

      {notGentu && (
        <div style={{ ...box, background: '#fdf5e4', borderColor: '#f0dcae', fontSize: 13 }}>
          The bookmark was clicked outside Gentu. Open your Gentu tab, log in, and click the bookmark there.
        </div>
      )}

      {!csv && (
        <div
          style={{ ...box, border: '2px dashed var(--border, #ccc)', textAlign: 'center', color: 'var(--muted, #777)' }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); onDrop(e.dataTransfer.files[0]) }}
        >
          Waiting for the export…
          <div style={{ fontSize: 12, marginTop: 6 }}>If nothing arrives, drop the downloaded CSV here.</div>
        </div>
      )}

      {csv && !rows && (
        <div style={{ ...box, background: '#fbeeee', borderColor: '#efcccc', color: '#8a2020', fontSize: 13 }}>
          Received a file {how}, but it isn&apos;t the Referrer Details report (needs Referrer, Practice, Specialty, Suburb, Referrals and Income Generated columns).
          <div><button onClick={() => setCsv(null)} style={{ marginTop: 8 }}>Clear</button></div>
        </div>
      )}

      {totals && (
        <div style={box}>
          <div style={{ fontSize: 12, color: 'var(--muted, #777)', marginBottom: 8 }}>Received {how}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[['Referrers', totals.referrers], ['Practices', totals.practices], ['Referrals', totals.referrals], ['Income', fmt$(totals.income)]].map(([k, v]) => (
              <div key={k as string}>
                <div style={{ fontSize: 11, color: 'var(--muted, #777)' }}>{k}</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
          <label style={{ fontSize: 12, fontWeight: 500 }}>Quarter this export covers</label>
          <input value={period} onChange={e => setPeriod(e.target.value.toUpperCase().trim())}
            style={{ display: 'block', width: '100%', padding: '7px 10px', marginTop: 4, fontFamily: 'monospace', fontSize: 14, border: '1px solid var(--border, #ccc)', borderRadius: 6, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 11, color: replacing ? '#a06000' : 'var(--muted, #777)', marginTop: 3 }}>
            {!validPeriod ? 'Format: 2026Q3' : replacing ? `${period} already exists — saving replaces it.` : 'Check this matches the date range you ran in Gentu.'}
          </div>
          <button onClick={save} disabled={saving || !validPeriod}
            style={{ marginTop: 12, width: '100%', padding: 10, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'var(--accent, #1a6b3c)', color: '#fff', opacity: saving || !validPeriod ? 0.6 : 1 }}>
            {saving ? 'Saving…' : `Save as ${validPeriod ? period : 'quarter'}`}
          </button>
          <button onClick={() => { setCsv(null); setMsg(null) }}
            style={{ marginTop: 6, width: '100%', padding: 6, background: 'transparent', border: 'none', color: 'var(--muted, #777)', cursor: 'pointer', fontSize: 12 }}>
            Discard
          </button>
        </div>
      )}

      {msg && (
        <div style={{ ...box, fontSize: 13, background: msg.type === 'success' ? '#eef7ee' : '#fbeeee', color: msg.type === 'success' ? '#1a5a25' : '#8a2020', borderColor: msg.type === 'success' ? '#cfe6cf' : '#efcccc' }}>
          {msg.text}
        </div>
      )}
    </main>
  )
}
