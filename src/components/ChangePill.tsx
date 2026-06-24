import { getTrendBand } from '@/lib/data'

const PILL_STYLES: Record<string, React.CSSProperties> = {
  'pill-up2':  { background: '#d4edda', color: '#155724' },
  'pill-up1':  { background: '#e8f5ee', color: '#1e6b2e' },
  'pill-flat': { background: '#f5f0e0', color: '#7a6000' },
  'pill-dn1':  { background: '#fde8d0', color: '#8a3a00' },
  'pill-dn2':  { background: '#fce8e8', color: '#9b2222' },
}

interface ChangePillProps {
  vals: number[]
}

export default function ChangePill({ vals }: ChangePillProps) {
  const nz = vals.filter(v => v > 0)
  if (nz.length < 2) {
    return (
      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, fontWeight: 500, ...PILL_STYLES['pill-flat'] }}>
        —
      </span>
    )
  }

  const latest = nz[nz.length - 1]
  const previous = nz.slice(0, -1)
  const avgPrevious = previous.reduce((s, v) => s + v, 0) / previous.length
  const pct = avgPrevious > 0 ? Math.round((latest - avgPrevious) / avgPrevious * 100) : 0

  const band = getTrendBand(vals)
  const style = PILL_STYLES[band.pillClass] ?? PILL_STYLES['pill-flat']

  return (
    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, fontWeight: 500, whiteSpace: 'nowrap', ...style }}>
      {pct > 0 ? '+' : ''}{pct}%
    </span>
  )
}
