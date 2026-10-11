'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Flag { rule: string; match: string }
interface HistItem { at: string; event: string; by?: string | null; note?: string }
interface Draft {
  id: string
  review_id: string
  category: 'positive' | 'negative' | 'mixed' | 'no_reply'
  draft_text: string | null
  model_text: string | null
  used_template: boolean
  check_flags: Flag[]
  status: 'pending' | 'posted' | 'skipped' | 'failed'
  final_text: string | null
  posted_at: string | null
  error: string | null
  history: HistItem[]
  updated_at: string
  gbp_reviews: {
    star_rating: number
    comment: string | null
    create_time: string
    reply_comment: string | null
    gbp_locations: { title: string; site_label: string | null }
  }
}
interface Settings {
  contact_phone: string | null
  contact_email: string | null
  contact_role: string
  signoff: string
  clinician_names: string[]
  blocked_terms: string[]
  draft_window_days: number
  auto_draft: boolean
}
type Status = Draft['status']

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 12 }
const btn = (kind: 'primary' | 'plain' | 'muted' = 'plain'): React.CSSProperties => ({
  padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
  border: kind === 'primary' ? 'none' : '1px solid var(--border)',
  background: kind === 'primary' ? 'var(--accent)' : 'transparent',
  color: kind === 'primary' ? 'white' : kind === 'muted' ? 'var(--muted)' : 'var(--text)',
})
const input: React.CSSProperties = { width: '100%', padding: '6px 9px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg, white)', color: 'var(--text)', boxSizing: 'border-box' }
const CAT: Record<Draft['category'], { label: string; color: string; bg: string }> = {
  positive: { label: 'Positive', color: '#1a5a25', bg: '#eef7ee' },
  negative: { label: 'Negative', color: '#8a2020', bg: '#fbeeee' },
  mixed:    { label: 'Mixed',    color: '#7a5200', bg: '#fdf5e4' },
  no_reply: { label: 'Needs a decision', color: '#555', bg: '#f0efec' },
}
const fmt = (s: string) => new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ReviewReplies({ practiceId }: { practiceId?: string }) {
  const [status, setStatus] = useState<Status>('pending')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [undrafted, setUndrafted] = useState(0)
  const [windowDays, setWindowDays] = useState(90)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/gbp/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ practiceId, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error ?? `Request failed (${res.status})`) as Error & { flags?: Flag[] }
      err.flags = data.flags
      throw err
    }
    return data
  }, [practiceId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, s] = await Promise.all([post({ action: 'list', status }), post({ action: 'settings' })])
      setDrafts(l.drafts); setUndrafted(l.undrafted); setWindowDays(l.windowDays); setSettings(s.settings)
    } catch (e) { setMsg({ type: 'error', text: (e as Error).message }) }
    setLoading(false)
  }, [post, status])

  useEffect(() => { load() }, [load])

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setMsg(null)
    try { const t = await fn(); if (t) setMsg({ type: 'success', text: t }) }
    catch (e) { setMsg({ type: 'error', text: (e as Error).message }) }
    setBusy(null)
  }

  const draftNew = () => run('draft', async () => {
    const r = await post({ action: 'draft' })
    await load()
    return `Drafted ${r.drafted} repl${r.drafted === 1 ? 'y' : 'ies'}${r.remaining ? ` — ${r.remaining} more waiting, run again` : ''}.${r.errors?.length ? ` ${r.errors.length} failed: ${r.errors[0]}` : ''}`
  })

  const contactMissing = settings && !settings.contact_phone && !settings.contact_email

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13,
          background: msg.type === 'success' ? '#eef7ee' : '#fbeeee',
          color: msg.type === 'success' ? '#1a5a25' : '#8a2020',
          border: `1px solid ${msg.type === 'success' ? '#cfe6cf' : '#efcccc'}`,
        }}>{msg.text}</div>
      )}

      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Review replies</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, maxWidth: 620, lineHeight: 1.5 }}>
            Drafts never confirm someone is a patient and never mention treatment, outcomes, dates, sites or staff.
            Every draft is checked automatically; drafts that fail fall back to a standard template. Nothing is posted until someone approves it,
            and the check runs again on the final text.
          </div>
          {contactMissing && (
            <div style={{ fontSize: 12, color: '#8a2020', marginTop: 6 }}>
              Add a contact phone or email in settings — negative replies point people to it.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btn('primary')} disabled={!!busy || !undrafted} onClick={draftNew}>
            {busy === 'draft' ? 'Drafting…' : `Draft new replies${undrafted ? ` (${undrafted})` : ''}`}
          </button>
          <button style={btn()} onClick={() => setShowSettings(v => !v)}>Settings</button>
        </div>
      </div>

      {showSettings && settings && (
        <SettingsPanel settings={settings} busy={busy === 'settings'} onSave={next => run('settings', async () => {
          const r = await post({ action: 'save_settings', settings: next })
          setSettings(r.settings); setShowSettings(false)
          return 'Reply settings saved.'
        })} />
      )}

      <div style={{ display: 'flex', gap: 4, margin: '6px 0 12px', alignItems: 'center', flexWrap: 'wrap' }}>
        {(['pending', 'posted', 'skipped', 'failed'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} style={{
            padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
            border: status === s ? '1px solid var(--border)' : '1px solid transparent',
            background: status === s ? 'var(--surface)' : 'transparent',
            color: status === s ? 'var(--text)' : 'var(--muted)', fontWeight: status === s ? 500 : 400,
          }}>{s === 'pending' ? 'To approve' : s[0].toUpperCase() + s.slice(1)}</button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
          Drafts cover unreplied reviews from the last {windowDays} days.
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : drafts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          {status === 'pending' ? (undrafted ? 'No drafts yet — click “Draft new replies”.' : 'Nothing waiting for approval.') : `No ${status} replies.`}
        </div>
      ) : drafts.map(d => (
        <DraftCard key={d.id} d={d} busy={busy} post={post} run={run} reload={load} />
      ))}
    </div>
  )
}

// ── One review + its draft ───────────────────────────────────────────────────
function DraftCard({ d, busy, post, run, reload }: {
  d: Draft
  busy: string | null
  post: (b: Record<string, unknown>) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  run: (k: string, fn: () => Promise<string | void>) => Promise<void>
  reload: () => Promise<void>
}) {
  const r = d.gbp_reviews
  const site = r.gbp_locations.site_label || r.gbp_locations.title
  const [text, setText] = useState(d.final_text ?? d.draft_text ?? '')
  const [flags, setFlags] = useState<Flag[]>([])
  const [checking, setChecking] = useState(false)
  const [showModel, setShowModel] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const editable = d.status === 'pending' || d.status === 'failed'

  // Live compliance check while editing
  useEffect(() => {
    if (!editable) return
    clearTimeout(timer.current)
    if (!text.trim()) { setFlags([]); return }
    setChecking(true)
    timer.current = setTimeout(async () => {
      try { setFlags((await post({ action: 'check', reviewId: d.review_id, text })).flags) } catch {}
      setChecking(false)
    }, 500)
    return () => clearTimeout(timer.current)
  }, [text, editable, d.review_id, post])

  const cat = CAT[d.category]

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: '#c89a00', letterSpacing: 1 }}>{stars(r.star_rating)}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{site} · {fmt(r.create_time)}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, color: cat.color, background: cat.bg }}>{cat.label}</span>
          {d.used_template && <span style={{ fontSize: 11, color: 'var(--muted)' }}>template</span>}
        </div>
        {d.status === 'posted' && d.posted_at && <span style={{ fontSize: 11, color: '#1a7a35' }}>Posted {fmt(d.posted_at)}</span>}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', padding: '8px 10px', background: 'var(--bg, #faf9f7)', borderRadius: 6, marginBottom: 10 }}>
        {r.comment?.trim() || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Star rating only — no written review</span>}
      </div>

      {r.reply_comment && d.status !== 'posted' && (
        <div style={{ fontSize: 12, color: '#7a5200', marginBottom: 8 }}>
          This review already has a reply on Google. Posting will replace it. Current reply: “{r.reply_comment}”
        </div>
      )}

      {d.used_template && d.check_flags.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          The AI draft broke {d.check_flags.length} rule{d.check_flags.length > 1 ? 's' : ''} ({[...new Set(d.check_flags.map(f => f.rule))].join(', ')}), so the standard template was used.{' '}
          {d.model_text && <button onClick={() => setShowModel(v => !v)} style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>{showModel ? 'Hide' : 'Show'} AI draft</button>}
          {showModel && d.model_text && <div style={{ marginTop: 4, fontStyle: 'italic' }}>{d.model_text}</div>}
        </div>
      )}
      {d.category === 'no_reply' && d.status === 'pending' && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
          No reply drafted — this looks like spam, abuse, or not about this practice. Skip it, report it to Google, or write a reply below.
          {d.history?.length ? <> Reason: {d.history[d.history.length - 1].note}</> : null}
        </div>
      )}
      {d.status === 'failed' && d.error && <div style={{ fontSize: 12, color: '#8a2020', marginBottom: 8 }}>{d.error}</div>}

      {editable ? (
        <>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
            placeholder="Write a reply…"
            style={{ ...input, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ minHeight: 18, fontSize: 12, marginTop: 4 }}>
            {checking ? <span style={{ color: 'var(--muted)' }}>Checking…</span>
              : flags.length ? <span style={{ color: '#8a2020' }}>Can’t post: {flags.map(f => `${f.rule} (“${f.match}”)`).join('; ')}</span>
              : text.trim() ? <span style={{ color: '#1a7a35' }}>Passes the compliance check</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={btn('primary')} disabled={!!busy || checking || !!flags.length || !text.trim()}
              onClick={() => run(`post:${d.id}`, async () => {
                if (!confirm('Post this reply publicly on Google?')) return
                try { await post({ action: 'post', draftId: d.id, text }) }
                catch (e) { const f = (e as { flags?: Flag[] }).flags; if (f) setFlags(f); throw e }
                await reload()
                return 'Reply posted to Google.'
              })}>
              {busy === `post:${d.id}` ? 'Posting…' : 'Approve & post'}
            </button>
            <button style={btn()} disabled={!!busy} onClick={() => run(`redraft:${d.id}`, async () => {
              await post({ action: 'redraft', reviewId: d.review_id }); await reload(); return 'Redrafted.'
            })}>{busy === `redraft:${d.id}` ? 'Redrafting…' : 'Redraft'}</button>
            <button style={btn('muted')} disabled={!!busy} onClick={() => run(`skip:${d.id}`, async () => {
              const note = prompt('Reason for not replying (optional):') ?? undefined
              await post({ action: 'skip', draftId: d.id, note }); await reload(); return 'Marked as no reply.'
            })}>Don’t reply</button>
          </div>
        </>
      ) : (
        <>
          {(d.final_text || d.draft_text) && (
            <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--border)', paddingLeft: 10 }}>
              {d.final_text ?? d.draft_text}
            </div>
          )}
          {d.status === 'skipped' && (
            <button style={{ ...btn('muted'), marginTop: 8 }} disabled={!!busy} onClick={() => run(`reopen:${d.id}`, async () => {
              await post({ action: 'reopen', draftId: d.id }); await reload(); return 'Moved back to approval.'
            })}>Reopen</button>
          )}
        </>
      )}

      {d.history?.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>Audit trail</summary>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {d.history.map((h, i) => (
              <div key={i}>{new Date(h.at).toLocaleString('en-AU')} — {h.event}{h.note ? `: ${h.note}` : ''}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsPanel({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (s: Settings) => void }) {
  const [s, setS] = useState({
    ...settings,
    clinician_names_text: settings.clinician_names.join(', '),
    blocked_terms_text: settings.blocked_terms.join(', '),
  })
  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      {el}
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{hint}</div>}
    </label>
  )
  return (
    <div style={card}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0 16px' }}>
        {field('Contact phone', <input style={input} value={s.contact_phone ?? ''} onChange={e => setS({ ...s, contact_phone: e.target.value })} />, 'Used in negative and mixed replies')}
        {field('Contact email', <input style={input} value={s.contact_email ?? ''} onChange={e => setS({ ...s, contact_email: e.target.value })} />)}
        {field('Contact role', <input style={input} value={s.contact_role} onChange={e => setS({ ...s, contact_role: e.target.value })} />, '“Please contact our … on …”')}
        {field('Sign-off', <input style={input} value={s.signoff} onChange={e => setS({ ...s, signoff: e.target.value })} />, 'Don’t use a clinician’s name')}
      </div>
      {field('Clinician and staff names (never allowed in a reply)',
        <textarea style={{ ...input, fontFamily: 'inherit' }} rows={2} value={s.clinician_names_text} onChange={e => setS({ ...s, clinician_names_text: e.target.value })} />,
        'Comma-separated. Surnames and first names are each blocked.')}
      {field('Extra blocked terms',
        <textarea style={{ ...input, fontFamily: 'inherit' }} rows={2} value={s.blocked_terms_text} onChange={e => setS({ ...s, blocked_terms_text: e.target.value })} />,
        'Comma-separated. Clinical terms, dates, site names, promotional language and anything implying a patient relationship are already blocked.')}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ fontSize: 12 }}>
          Draft for reviews from the last{' '}
          <input type="number" min={7} max={730} value={s.draft_window_days}
            onChange={e => setS({ ...s, draft_window_days: Number(e.target.value) })}
            style={{ ...input, width: 70, display: 'inline-block' }} /> days
        </label>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={s.auto_draft} onChange={e => setS({ ...s, auto_draft: e.target.checked })} />
          Draft new reviews automatically in the weekly sync
        </label>
      </div>
      <button style={btn('primary')} disabled={busy} onClick={() => onSave({
        ...s,
        clinician_names: s.clinician_names_text.split(',').map(x => x.trim()).filter(Boolean),
        blocked_terms: s.blocked_terms_text.split(',').map(x => x.trim()).filter(Boolean),
      })}>{busy ? 'Saving…' : 'Save settings'}</button>
    </div>
  )
}
