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
  // Full rebuild: one CSV per quarter
  const [batch, setBatch] = useState<Record<string, { csv?: string; error?: string }>>({})
  const [batchTotal, setBatchTotal] = useState(0)
  const [batchDone, setBatchDone] = useState(false)
  const [batchSaving, setBatchSaving] = useState<string | null>(null)
  const [batchSaved, setBatchSaved] = useState<Record<string, string>>({})

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setPracticeId(p.get('practiceId') ?? undefined)
    setNotGentu(p.get('hint') === 'notgentu')

    const onMsg = (e: MessageEvent) => {
      if (!GENTU_ORIGIN.test(e.origin)) return
      const d = e.data as GentuCsvMessage
      if (!d || d.type !== 'omsref-gentu-csv') return
      setNotGentu(false)
      if (d.batchStart) { setBatch({}); setBatchTotal(d.batchStart); setBatchDone(false); setBatchSaved({}); setCsv(null); setMsg(null); return }
      if (d.batchItem) { const q = d.batchItem; setBatch(b => ({ ...b, [q]: { csv: d.csv, error: d.error } })); return }
      if (d.batchDone) { setBatchDone(true); return }
      if (typeof d.csv !== 'string') return
      setCsv(d.csv); setMsg(null)
      setHow(`from Gentu${d.range ? ` (${d.range[0]} – ${d.range[1]})` : ''}`)
      if (d.period) setPeriod(d.period)
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

  const batchRows = Object.keys(batch).sort().map(q => {
    const it = batch[q]
    const r = it.csv ? parseGentuCSV(it.csv) : null
    return {
      q, error: it.error, rows: r,
      referrers: r?.length ?? 0,
      referrals: r?.reduce((s, x) => s + x.referrals, 0) ?? 0,
      income: r?.reduce((s, x) => s + x.income, 0) ?? 0,
    }
  })
  const saveable = batchRows.filter(r => r.rows && r.rows.length)

  async function saveAll() {
    const replacingN = saveable.filter(r => existing.includes(r.q)).length
    if (!confirm(`Save ${saveable.length} quarters from Gentu?${replacingN ? ` ${replacingN} existing quarter(s) will be replaced.` : ''} Quarters not in this pull are left as they are.`)) return
    setMsg(null)
    let ok = 0
    for (const r of saveable) {
      setBatchSaving(r.q)
      try {
        const res = await fetch('/api/upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period: r.q, csvText: batch[r.q].csv, practiceId }),
        })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
        setBatchSaved(s => ({ ...s, [r.q]: 'saved' })); ok++
      } catch (e) { setBatchSaved(s => ({ ...s, [r.q]: `failed: ${(e as Error).message}` })) }
    }
    setBatchSaving(null)
    setExisting(e => [...new Set([...e, ...saveable.map(r => r.q)])])
    setMsg({ type: ok === saveable.length ? 'success' : 'error', text: `${ok} of ${saveable.length} quarters saved. Reload omsref to see them.` })
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
        Keep this window open. In the Gentu tab, run <b>Reports → Referral Report → Referrer Details</b> and click export.
        The CSV arrives here automatically. To rebuild every quarter, click <b>Pull every quarter</b> on the note in Gentu after the first export.
      </div>

      {notGentu && (
        <div style={{ ...box, background: '#fdf5e4', borderColor: '#f0dcae', fontSize: 13 }}>
          The bookmark was clicked outside Gentu. Open your Gentu tab, log in, and click the bookmark there.
        </div>
      )}

      {batchTotal > 0 && (
        <div style={box}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Full rebuild from Gentu</div>
          <div style={{ fontSize: 12, color: 'var(--muted, #777)', marginBottom: 10 }}>
            {batchDone ? `Received ${batchRows.length} of ${batchTotal} quarters.` : `Receiving… ${batchRows.length} of ${batchTotal} quarters`}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{['Quarter', 'Referrers', 'Referrals', 'Income', ''].map(h => <th key={h} style={{ textAlign: h === 'Quarter' || h === '' ? 'left' : 'right', padding: '4px 6px', color: 'var(--muted, #777)', fontWeight: 500, borderBottom: '1px solid var(--border, #e2e0db)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {batchRows.map(r => (
                <tr key={r.q}>
                  <td style={{ padding: '4px 6px', fontFamily: 'monospace' }}>{r.q}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.rows ? r.referrers : '—'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.rows ? r.referrals : '—'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.rows ? fmt$(r.income) : '—'}</td>
                  <td style={{ padding: '4px 6px', color: r.error || batchSaved[r.q]?.startsWith('failed') ? '#8a2020' : 'var(--muted, #777)' }}>
                    {batchSaving === r.q ? 'saving…' : batchSaved[r.q] ?? (r.error ? r.error : !r.rows ? 'empty — skipped' : existing.includes(r.q) ? 'replaces existing' : 'new')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={saveAll} disabled={!batchDone || !saveable.length || !!batchSaving}
            style={{ marginTop: 12, width: '100%', padding: 10, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'var(--accent, #1a6b3c)', color: '#fff', opacity: !batchDone || !saveable.length || batchSaving ? 0.6 : 1 }}>
            {batchSaving ? `Saving ${batchSaving}…` : `Save all ${saveable.length} quarters`}
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted, #777)', marginTop: 6 }}>
            Quarters before Gentu (pre Sept 2022) aren&apos;t touched. Check a couple of totals against quarters you already have before saving.
          </div>
        </div>
      )}

      {!csv && batchTotal === 0 && (
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
