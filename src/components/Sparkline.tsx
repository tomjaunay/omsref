import { getTrendBand } from '@/lib/data'

interface SparklineProps {
  vals: number[]
  w?: number
  h?: number
}

export default function Sparkline({ vals, w = 90, h = 28 }: SparklineProps) {
  if (!vals || vals.length < 2) {
    return <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
  }
  const band = getTrendBand(vals)
  const max = Math.max(...vals, 1)
  const points = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * (w - 4) + 2
      const y = h - 4 - (v / max) * (h - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastPt = points.split(' ').pop()!.split(',')

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block' }}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={band.stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastPt[0]} cy={lastPt[1]} r={2.5} fill={band.stroke} />
    </svg>
  )
}
