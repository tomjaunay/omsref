'use client'
import { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface GbpLocation {
  id: string
  title: string
  address: string | null
  site_label: string | null
  selected: boolean
  total_reviews: number | null
  average_rating: number | null
  last_synced_at: string | null
}

interface Connection { google_email: string | null; connected_at: string; last_error: string | null }

interface Analysis { period: string; scope: string; source: string; review_count: number; uploaded_at: string }

interface BucketStats {
  review_count: number
  with_text: number
  avg_rating: number | null
  positive_ratings: number
  negative_ratings: number
  unreplied: number
}

interface SourceBucket extends BucketStats {
  location_id: string
  title: string
  site_label: string | null
  selected: boolean
  analysis: Analysis | null
}

interface QuarterBucket {
  quarter: string
  all: BucketStats
  analysis: Analysis | null
  sources: SourceBucket[]
}

export const locLabel = (l: { site_label: string | null; title: string }) => l.site_label || l.title

const btn = (primary = false): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
  border: primary ? 'none' : '1px solid var(--border)',
  background: primary ? 'var(--accent)' : 'transparent',
  color: primary ? 'white' : 'var(--text)',
})
const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, borderBottom: '1.5px solid var(--divider)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--divider)', verticalAlign: 'top' }
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 16 }

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ReviewSources({ practiceId, onAnalysed }: { practiceId?: string; onAnalysed: () => void }) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [locations, setLocations] = useState<GbpLocation[]>([])
  const [buckets, setBuckets] = useState<QuarterBucket[]>([])
  const [draft, setDraft] = useState<Record<string, { selected: boolean; site_label: string }>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const post = useCallback(async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceId, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
    return data
  }, [practiceId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loc, b] = await Promise.all([
        post('/api/gbp/locations', { action: 'list' }),
        post('/api/gbp/buckets', {}),
      ])
      setConnection(loc.connection)
      setLocations(loc.locations)
      setDraft(Object.fromEntries((loc.locations as GbpLocation[]).map(l => [l.id, { selected: l.selected, site_label: l.site_label ?? '' }])))
      setBuckets(b.buckets)
    } catch (e) { setMsg({ type: 'error', text: (e as Error).message }) }
    setLoading(false)
  }, [post])

  useEffect(() => { load() }, [load])

  // Message passed back from the Google OAuth callback
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const m = p.get('gbp')
    if (m) {
      setMsg({ type: /fail|cancel|expired|did not/i.test(m) ? 'error' : 'success', text: m })
      p.delete('gbp'); p.delete('tab')
      window.history.replaceState(null, '', window.location.pathname + (p.toString() ? `?${p}` : ''))
    }
  }, [])

  function connect() {
    const qs = new URLSearchParams({ returnTo: window.location.pathname })
    if (practiceId) qs.set('practiceId', practiceId)
    window.location.href = `/api/gbp/connect?${qs}`
  }

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ type: 'success', text })
    } catch (e) { setMsg({ type: 'error', text: (e as Error).message }) }
    setBusy(null)
  }

  const dirty = locations.some(l => draft[l.id] && (draft[l.id].selected !== l.selected || (draft[l.id].site_label || '') !== (l.site_label || '')))

  const saveSelection = () => run('save', async () => {
    const updates = locations
      .filter(l => draft[l.id])
      .map(l => ({ id: l.id, selected: draft[l.id].selected, site_label: draft[l.id].site_label }))
    await post('/api/gbp/locations', { action: 'update', updates })
    const newlySelected = locations.filter(l => draft[l.id]?.selected && !l.last_synced_at)
    if (newlySelected.length) {
      const r = await post('/api/gbp/sync', {})
      await load()
      const n = (r.results as Array<{ upserted: number }>).reduce((a, x) => a + x.upserted, 0)
      return `Selection saved. Initial backfill pulled ${n} review(s) into quarterly buckets.`
    }
    await load()
    return 'Selection saved.'
  })

  const sync = (full: boolean) => run(full ? 'full' : 'sync', async () => {
    const r = await post('/api/gbp/sync', { full })
    await load()
    const res = r.results as Array<{ location: string; upserted: number; removed: number }>
    if (!res.length) return 'No business profiles selected.'
    return 'Synced: ' + res.map(x => `${x.location} ${x.upserted} updated${x.removed ? `, ${x.removed} removed` : ''}`).join(' · ')
  })

  const analyse = (quarter: string, scope: string, label: string, existing: Analysis | null) => run(`a:${quarter}:${scope}`, async () => {
    if (existing?.source === 'manual' && !confirm(`${quarter} already has a manually uploaded analysis. Replace it with the synced Google reviews?`)) return
    const r = await post('/api/reviews/analyse', { source: 'gbp', period: quarter, scope })
    await load()
    onAnalysed()
    return `${quarter} · ${label}: coded ${r.codedCount} written review(s) of ${r.reviewCount}.`
  })

  const refreshProfiles = () => run('refresh', async () => {
    const r = await post('/api/gbp/locations', { action: 'refresh' })
    await load()
    return `${r.found} business profile(s) found on the connected account.`
  })

  const disconnect = () => run('disconnect', async () => {
    if (!confirm('Disconnect the Google account? Synced reviews and analyses are kept; the weekly sync stops.')) return
    await post('/api/gbp/locations', { action: 'disconnect' })
    await load()
    return 'Google account disconnected.'
  })

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading sources…</div>

  const selected = locations.filter(l => l.selected)

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'success' ? '#eef7ee' : '#fbeeee',
          color: msg.type === 'success' ? '#1a5a25' : '#8a2020',
          border: `1px solid ${msg.type === 'success' ? '#cfe6cf' : '#efcccc'}`,
        }}>{msg.text}</div>
      )}

      {/* ── Connection ── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Google Business Profile</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              {connection
                ? <>Connected as {connection.google_email ?? 'Google account'} · since {fmtDate(connection.connected_at)} · syncs weekly (Monday morning)</>
                : 'Connect the Google account that manages your business profiles to pull reviews automatically.'}
            </div>
            {connection?.last_error && (
              <div style={{ fontSize: 12, color: '#8a2020', marginTop: 4 }}>Last sync error: {connection.last_error}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {connection ? (
              <>
                <button style={btn()} disabled={!!busy} onClick={refreshProfiles}>{busy === 'refresh' ? 'Checking…' : 'Find new profiles'}</button>
                <button style={btn()} disabled={!!busy} onClick={connect}>Reconnect</button>
                <button style={{ ...btn(), color: 'var(--muted)' }} disabled={!!busy} onClick={disconnect}>Disconnect</button>
              </>
            ) : (
              <button style={btn(true)} onClick={connect}>Connect Google account</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Profile selection ── */}
      {locations.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Review sources</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                Tick the profiles to pull reviews from. The report label is the short name used in tables and PDFs.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={btn(true)} disabled={!dirty || !!busy} onClick={saveSelection}>{busy === 'save' ? 'Saving…' : 'Save selection'}</button>
              <button style={btn()} disabled={!selected.length || dirty || !!busy} onClick={() => sync(false)}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
              <button style={{ ...btn(), color: 'var(--muted)' }} disabled={!selected.length || dirty || !!busy} onClick={() => sync(true)}
                title="Re-pull every review and remove any deleted on Google">{busy === 'full' ? 'Resyncing…' : 'Full resync'}</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 30 }}></th>
                  <th style={th}>Business profile</th>
                  <th style={th}>Report label</th>
                  <th style={{ ...th, textAlign: 'right' }}>Reviews on Google</th>
                  <th style={{ ...th, textAlign: 'right' }}>Rating</th>
                  <th style={th}>Last synced</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(l => {
                  const d = draft[l.id] ?? { selected: l.selected, site_label: l.site_label ?? '' }
                  return (
                    <tr key={l.id} style={{ opacity: d.selected ? 1 : 0.65 }}>
                      <td style={td}>
                        <input type="checkbox" checked={d.selected}
                          onChange={e => setDraft(p => ({ ...p, [l.id]: { ...d, selected: e.target.checked } }))} />
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{l.title}</div>
                        {l.address && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{l.address}</div>}
                      </td>
                      <td style={td}>
                        <input value={d.site_label} placeholder={l.title}
                          onChange={e => setDraft(p => ({ ...p, [l.id]: { ...d, site_label: e.target.value } }))}
                          style={{ width: 130, padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg, white)' }} />
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.total_reviews ?? '—'}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.average_rating != null ? `${Number(l.average_rating).toFixed(1)}★` : '—'}</td>
                      <td style={{ ...td, fontSize: 12, color: 'var(--muted)' }}>{fmtDate(l.last_synced_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Quarterly buckets ── */}
      {buckets.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Quarterly buckets</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 12px' }}>
            Reviews grouped by calendar quarter (Sydney time) of the review date. <b>Combined</b> covers the selected profiles and feeds Theme trends and the PDF report.
            Each profile can also be analysed on its own. Cells show reviews · written · average rating.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={th}>Quarter</th>
                  <th style={th}>Combined</th>
                  {selected.map(l => <th key={l.id} style={th}>{locLabel(l)}</th>)}
                </tr>
              </thead>
              <tbody>
                {buckets.map(b => (
                  <tr key={b.quarter}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{b.quarter}</td>
                    <BucketCell stats={b.all} analysis={b.analysis} busy={busy === `a:${b.quarter}:all`} disabled={!!busy}
                      onAnalyse={() => analyse(b.quarter, 'all', 'Combined', b.analysis)} />
                    {selected.map(l => {
                      const s = b.sources.find(x => x.location_id === l.id)
                      return s
                        ? <BucketCell key={l.id} stats={s} analysis={s.analysis} busy={busy === `a:${b.quarter}:${l.id}`} disabled={!!busy}
                            onAnalyse={() => analyse(b.quarter, l.id, locLabel(l), s.analysis)} />
                        : <td key={l.id} style={{ ...td, color: 'var(--muted)' }}>—</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {connection && locations.length > 0 && buckets.length === 0 && (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13 }}>
          Select at least one profile and save to run the initial backfill.
        </div>
      )}
    </div>
  )
}

function BucketCell({ stats, analysis, busy, disabled, onAnalyse }: {
  stats: BucketStats; analysis: Analysis | null; busy: boolean; disabled: boolean; onAnalyse: () => void
}) {
  if (!stats.review_count) return <td style={{ ...td, color: 'var(--muted)' }}>—</td>
  const stale = analysis && analysis.source === 'gbp' && analysis.review_count !== stats.review_count
  return (
    <td style={td}>
      <div style={{ fontFamily: 'var(--font-mono)' }}>
        {stats.review_count} · {stats.with_text} · {stats.avg_rating != null ? `${Number(stats.avg_rating).toFixed(1)}★` : '—'}
      </div>
      {stats.unreplied > 0 && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{stats.unreplied} without reply</div>}
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        {analysis && (
          <span style={{ fontSize: 10, color: stale ? '#a06000' : '#1a7a35' }}>
            {stale ? 'new reviews since analysis' : analysis.source === 'manual' ? 'analysed (manual upload)' : 'analysed'}
          </span>
        )}
        {stats.with_text > 0 && (
          <button onClick={onAnalyse} disabled={disabled}
            style={{ padding: '2px 8px', fontSize: 10, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)' }}>
            {busy ? 'Coding…' : analysis ? 'Re-analyse' : 'Analyse'}
          </button>
        )}
      </div>
    </td>
  )
}
