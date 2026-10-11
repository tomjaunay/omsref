'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

// Horizontal scroller for wide quarter tables: a sticky arrow bar above the table
// (◀ ▶, a position slider and "Latest"), opening scrolled to the most recent quarters.
export default function ScrollX({ children, resetKey }: { children: React.ReactNode; resetKey: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, max: 0 })

  const measure = useCallback(() => {
    const el = ref.current
    if (el) setPos({ left: el.scrollLeft, max: Math.max(0, el.scrollWidth - el.clientWidth) })
  }, [])

  // Jump to the latest quarters whenever the column set changes
  useEffect(() => {
    const el = ref.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollLeft = el.scrollWidth; measure() })
  }, [resetKey, measure])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const by = (dir: -1 | 1) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.6), behavior: 'smooth' })
  }
  const go = (x: number) => { const el = ref.current; if (el) el.scrollTo({ left: x, behavior: 'smooth' }) }

  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 30, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
    color: disabled ? 'var(--border)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 13, flexShrink: 0,
  })
  const atStart = pos.left <= 2
  const atEnd = pos.left >= pos.max - 2

  return (
    <div>
      {pos.max > 0 && (
        <div style={{
          position: 'sticky', top: 54, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 0', background: 'var(--bg)', marginBottom: 4,
        }}>
          <button aria-label="Earlier quarters" style={btn(atStart)} disabled={atStart} onClick={() => by(-1)}>◀</button>
          <input type="range" min={0} max={pos.max} value={Math.round(pos.left)} aria-label="Scroll quarters"
            onChange={e => { const el = ref.current; if (el) el.scrollLeft = Number(e.target.value) }}
            style={{ flex: 1, accentColor: 'var(--accent)' }} />
          <button aria-label="Later quarters" style={btn(atEnd)} disabled={atEnd} onClick={() => by(1)}>▶</button>
          <button onClick={() => go(0)} disabled={atStart}
            style={{ ...btn(atStart), width: 'auto', padding: '0 10px', fontSize: 11 }}>Earliest</button>
          <button onClick={() => go(pos.max)} disabled={atEnd}
            style={{ ...btn(atEnd), width: 'auto', padding: '0 10px', fontSize: 11 }}>Latest</button>
        </div>
      )}
      <div ref={ref} onScroll={measure} style={{ overflowX: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

/** Sticky-left cell style so the name columns stay visible while scrolling quarters. */
export const stickyCol = (left: number, width: number): React.CSSProperties => ({
  position: 'sticky', left, zIndex: 2, background: 'var(--bg)', minWidth: width, maxWidth: width,
})
