'use client'
import { useEffect, useRef, useState } from 'react'
import { buildBookmarklet, consoleScript } from '@/lib/gentuBookmarklet'

// Card on the Upload tab: a draggable "Pull from Gentu" bookmark plus a console-script fallback.
export default function GentuPullCard({ practiceId, onFocusBack }: { practiceId?: string; onFocusBack?: () => void }) {
  const link = useRef<HTMLAnchorElement>(null)
  const [script, setScript] = useState('')
  const [copied, setCopied] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const q = practiceId ? `?practiceId=${encodeURIComponent(practiceId)}` : ''
    // Set via the DOM: React warns about javascript: URLs in JSX
    link.current?.setAttribute('href', buildBookmarklet(window.location.origin, q))
    setScript(consoleScript(window.location.origin, q))
  }, [practiceId])

  // Refresh the dashboard when the user comes back from the Gentu / receiver windows
  useEffect(() => {
    if (!onFocusBack) return
    window.addEventListener('focus', onFocusBack)
    return () => window.removeEventListener('focus', onFocusBack)
  }, [onFocusBack])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 26, background: 'var(--surface)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Pull from Gentu</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>
        One-off setup: drag this button to your bookmarks bar. Then, in a logged-in Gentu tab, click the bookmark, run the
        <strong> Referrer Details</strong> report for a quarter and export it. omsref opens a small window with the totals for you to confirm and save.
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <a ref={link} href="#" onClick={e => { e.preventDefault(); setShowHelp(true) }} draggable
          title="Drag me to your bookmarks bar"
          style={{ display: 'inline-block', padding: '7px 14px', borderRadius: 7, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'grab' }}>
          ⇩ Pull from Gentu → omsref
        </a>
        <button onClick={() => setShowHelp(v => !v)}
          style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
          {showHelp ? 'Hide help' : 'Help'}
        </button>
      </div>
      {showHelp && (
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginTop: 12 }}>
          <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>
            <li>Show the bookmarks bar (Ctrl+Shift+B) and drag the green button onto it. Clicking it here does nothing.</li>
            <li>Open Gentu and log in. Click the bookmark: a small omsref window opens and Gentu shows a “watching for the export” note.</li>
            <li>Run <b>Reports → Referral Report → Referrer Details</b> for one quarter and export the CSV as usual.</li>
            <li>Check the quarter and totals in the omsref window, then click <b>Save</b>.</li>
          </ol>
          Only the export file is captured; nothing else on the Gentu page is read, and the report is already totalled per referrer.
          Allow pop-ups for Gentu if the window doesn’t open. If the bookmark won’t run, paste this into the DevTools console (F12 → Console) on the Gentu tab instead:
          <div style={{ marginTop: 6 }}>
            <button onClick={() => { navigator.clipboard.writeText(script).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
              style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}>
              {copied ? 'Copied' : 'Copy console script'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
