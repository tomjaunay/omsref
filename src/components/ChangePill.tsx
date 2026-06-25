import { calcTrendStats } from '@/lib/data'

const DEVIATION_STYLES: Record<string, React.CSSProperties> = {
  'pill-up2':  { background: '#d4edda', color: '#155724' },
  'pill-up1':  { background: '#e8f5ee', color: '#1e6b2e' },
  'pill-flat': { background: '#f5f0e0', color: '#7a6000' },
  'pill-dn1':  { background: '#fde8d0', color: '#8a3a00' },
  'pill-dn2':  { background: '#fce8e8', color: '#9b2222' },
}

const CV_STYLES = {
  stable:       { background: '#eef6ff', color: '#1a4a7a' },
  variable:     { background: '#f5f0e0', color: '#7a6000' },
  erratic:      { background: '#fce8e8', color: '#9b2222' },
  insufficient: { background: '#f0f0f0', color: '#999' },
}

const CV_LABELS = {
  stable:       'stable',
  variable:     'variable',
  erratic:      'erratic',
  insufficient: '—',
}

const PILL_BASE: React.CSSProperties = {
  fontSize: 10,
  padding: '1px 7px',
  borderRadius: 8,
  fontWeight: 500,
  display: 'inline-block',
}

interface ChangePillProps {
  vals: number[]
}

export default function ChangePill({ vals }: ChangePillProps) {
  const stats = calcTrendStats(vals)

  if (!stats.hasEnoughData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ ...PILL_BASE, ...CV_STYLES.insufficient }}>
          need 4+ qtrs
        </span>
      </div>
    )
  }

  // Deviation pill colour — reuse the same band logic
  const pct = stats.latestVsMedian
  let deviationStyle = DEVIATION_STYLES['pill-flat']
  if (pct >= 20)       deviationStyle = DEVIATION_STYLES['pill-up2']
  else if (pct >= 5)   deviationStyle = DEVIATION_STYLES['pill-up1']
  else if (pct >= -5)  deviationStyle = DEVIATION_STYLES['pill-flat']
  else if (pct >= -20) deviationStyle = DEVIATION_STYLES['pill-dn1']
  else                 deviationStyle = DEVIATION_STYLES['pill-dn2']

  const sign = pct > 0 ? '+' : ''

return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 150 }}>
    <span
      style={{ ...PILL_BASE, ...deviationStyle }}
      title={`Latest: ${stats.latest} · Median of previous qtrs: ${stats.median}`}
    >
      {sign}{pct}% vs median
    </span>
    <span
      style={{ ...PILL_BASE, ...CV_STYLES[stats.cvLabel] }}
      title={`Coefficient of variation: ${stats.cv}% — measures consistency across all active quarters`}
    >
      {CV_LABELS[stats.cvLabel]} (CV {stats.cv}%)
    </span>
  </div>
)
