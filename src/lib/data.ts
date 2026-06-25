// ── Types ──────────────────────────────────────────────────────────────────────

export interface RawRow {
  period: string
  referrer: string
  practice: string
  specialty: string
  suburb: string
  referrals: number
  income: number
}

export interface PracticePeriodData {
  refs: number
  inc: number
}

export interface PracticeRow {
  practice: string
  pd: Record<string, PracticePeriodData>
  totalRefs: number
  totalIncome: number
  totalComplex: number
  latestRefs: number
  latestIncome: number
  latestComplex: number
}

export interface DentistRow {
  referrer: string
  practice: string
  specialty: string
  pd: Record<string, PracticePeriodData>
  totalRefs: number
  totalIncome: number
  totalComplex: number
  latestRefs: number
  latestIncome: number
  latestComplex: number
  quartersActive: number
}

export type Metric = 'refs' | 'income' | 'complexity'
export type DashTab = 'practices' | 'dentists'
export type SortDir = 'desc' | 'asc'

// ── Sort option definitions ───────────────────────────────────────────────────

export interface SortOption {
  val: string
  label: string
}

export const PRAC_SORTS: SortOption[] = [
  { val: 'totalRefs',     label: 'Total referrals' },
  { val: 'totalIncome',   label: 'Total income' },
  { val: 'totalComplex',  label: 'Avg complexity ($/ref)' },
  { val: 'latestRefs',    label: 'Latest quarter — referrals' },
  { val: 'latestIncome',  label: 'Latest quarter — income' },
  { val: 'latestComplex', label: 'Latest quarter — complexity' },
  { val: 'practice',      label: 'Practice name A–Z' },
]

export const DENT_SORTS: SortOption[] = [
  { val: 'totalRefs',     label: 'Total referrals' },
  { val: 'totalIncome',   label: 'Total income' },
  { val: 'totalComplex',  label: 'Avg complexity ($/ref)' },
  { val: 'latestRefs',    label: 'Latest quarter — referrals' },
  { val: 'latestIncome',  label: 'Latest quarter — income' },
  { val: 'latestComplex', label: 'Latest quarter — complexity' },
  { val: 'quartersActive', label: 'Consistency (quarters active)' },
  { val: 'referrer',      label: 'Dentist name A–Z' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

export const fmt$ = (v: number) => '$' + Math.round(v).toLocaleString()
export const fmtK = (v: number) =>
  v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + Math.round(v)
export const complexity = (refs: number, inc: number) =>
  refs > 0 ? Math.round(inc / refs) : 0

export function sortPeriods(arr: string[]): string[] {
  return [...arr].sort((a, b) => {
    const pv = (s: string) => {
      const m = s.match(/^(\d{4})Q([1-4])$/)
      return m ? parseInt(m[1]) * 10 + parseInt(m[2]) : 0
    }
    return pv(a) - pv(b)
  })
}

export function metricVal(
  metric: Metric,
  refs: number,
  inc: number
): number {
  if (metric === 'refs') return refs
  if (metric === 'income') return inc
  return complexity(refs, inc)
}

export function metricFmt(metric: Metric, v: number): string {
  if (v === 0) return '—'
  if (metric === 'refs') return String(v)
  if (metric === 'income') return fmtK(v)
  return fmt$(v)
}

export function metricLabel(metric: Metric): string {
  if (metric === 'refs') return 'Referrals'
  if (metric === 'income') return 'Income'
  return '$/ref'
}

// ── Aggregation ───────────────────────────────────────────────────────────────

export function buildPracticeTable(
  db: Record<string, RawRow[]>,
  periods: string[],
  sortKey: string,
  sortDir: SortDir
): PracticeRow[] {
  const m: Record<string, Record<string, PracticePeriodData>> = {}
  for (const p of periods) {
    for (const r of db[p] ?? []) {
      if (!r.referrals) continue
      if (!m[r.practice]) m[r.practice] = {}
      if (!m[r.practice][p]) m[r.practice][p] = { refs: 0, inc: 0 }
      m[r.practice][p].refs += r.referrals
      m[r.practice][p].inc += r.income
    }
  }
  const lp = periods[periods.length - 1]
  const rows: PracticeRow[] = Object.entries(m).map(([practice, pd]) => {
    let tr = 0, ti = 0
    for (const p of periods) { tr += pd[p]?.refs ?? 0; ti += pd[p]?.inc ?? 0 }
    const lr = pd[lp]?.refs ?? 0
    const li = pd[lp]?.inc ?? 0
    return {
      practice, pd,
      totalRefs: tr, totalIncome: Math.round(ti * 100) / 100,
      totalComplex: complexity(tr, ti),
      latestRefs: lr, latestIncome: li, latestComplex: complexity(lr, li),
    }
  })
  return applySortDir(rows, sortKey, sortDir, 'practice')
}

export function buildDentistTable(
  db: Record<string, RawRow[]>,
  periods: string[],
  sortKey: string,
  sortDir: SortDir
): DentistRow[] {
  const m: Record<string, DentistRow> = {}
  for (const p of periods) {
    for (const r of db[p] ?? []) {
      if (!r.referrals) continue
      const key = `${r.referrer}||${r.practice}`
      if (!m[key]) m[key] = {
        referrer: r.referrer, practice: r.practice, specialty: r.specialty,
        pd: {}, totalRefs: 0, totalIncome: 0, totalComplex: 0,
        latestRefs: 0, latestIncome: 0, latestComplex: 0, quartersActive: 0,
      }
      if (!m[key].pd[p]) m[key].pd[p] = { refs: 0, inc: 0 }
      m[key].pd[p].refs += r.referrals
      m[key].pd[p].inc += r.income
    }
  }
  const lp = periods[periods.length - 1]
  const rows = Object.values(m).map(d => {
    let tr = 0, ti = 0, qa = 0
    for (const p of periods) {
      const v = d.pd[p]?.refs ?? 0
      tr += v; ti += d.pd[p]?.inc ?? 0
      if (v > 0) qa++
    }
    const lr = d.pd[lp]?.refs ?? 0
    const li = d.pd[lp]?.inc ?? 0
    return {
      ...d,
      totalRefs: tr, totalIncome: Math.round(ti * 100) / 100,
      totalComplex: complexity(tr, ti),
      latestRefs: lr, latestIncome: li, latestComplex: complexity(lr, li),
      quartersActive: qa,
    }
  })
  return applySortDir(rows, sortKey, sortDir, 'referrer')
}

function applySortDir<T extends object>(
  rows: T[],
  key: string,
  dir: SortDir,
  nameKey: string
): T[] {
  const mul = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return mul * av.localeCompare(bv)
    }
    const diff = (Number(bv) - Number(av)) * mul
    if (diff !== 0) return diff
    const an = (a as Record<string, unknown>)[nameKey]
    const bn = (b as Record<string, unknown>)[nameKey]
    return String(an).localeCompare(String(bn))
  })
}

// ── CSV parser ────────────────────────────────────────────────────────────────

export function parseGentuCSV(text: string): Omit<RawRow, 'period'>[] | null {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return null
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: Omit<RawRow, 'period'>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells: string[] = []
    let cur = '', inQ = false
    for (const ch of lines[i]) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cells.push(cur.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => (obj[h] = cells[idx] ?? ''))
    if (!obj['Referrer'] || !obj['Referrals']) continue
    const income = parseFloat((obj['Income Generated'] ?? '0').replace(/[$,]/g, '')) || 0
    const referrals = parseInt(obj['Referrals']) || 0
    if (!referrals) continue
    rows.push({
      referrer: obj['Referrer'].trim(),
      practice: (obj['Practice'] ?? '').trim(),
      specialty: (obj['Specialty'] ?? 'Unknown').trim() || 'Unknown',
      suburb: (obj['Suburb'] ?? '').trim(),
      referrals,
      income: Math.round(income * 100) / 100,
    })
  }
  return rows.length ? rows : null
}

// ── Statistical helpers ───────────────────────────────────────────────────────

export interface TrendStats {
  latestVsMedian: number      // % deviation of latest from median of previous quarters
  cv: number                  // coefficient of variation across all active quarters (%)
  cvLabel: 'stable' | 'variable' | 'erratic' | 'insufficient'
  hasEnoughData: boolean      // requires >= 4 active quarters
  median: number              // median of previous quarters
  latest: number              // latest quarter value
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function stddev(vals: number[], mean: number): number {
  if (vals.length < 2) return 0
  const variance = vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length
  return Math.sqrt(variance)
}

export function calcTrendStats(vals: number[]): TrendStats {
  const active = vals.filter(v => v > 0)

  if (active.length < 4) {
    return {
      latestVsMedian: 0, cv: 0,
      cvLabel: 'insufficient', hasEnoughData: false,
      median: 0, latest: active[active.length - 1] ?? 0,
    }
  }

  const latest = active[active.length - 1]
  const previous = active.slice(0, -1)
  const med = median(previous)
  const latestVsMedian = med > 0 ? ((latest - med) / med) * 100 : 0

  // CV across all active quarters
  const mean = active.reduce((s, v) => s + v, 0) / active.length
  const cv = mean > 0 ? (stddev(active, mean) / mean) * 100 : 0

  const cvLabel: TrendStats['cvLabel'] =
    cv < 30 ? 'stable' : cv < 50 ? 'variable' : 'erratic'

  return {
    latestVsMedian: Math.round(latestVsMedian),
    cv: Math.round(cv),
    cvLabel,
    hasEnoughData: true,
    median: Math.round(med * 10) / 10,
    latest,
  }
}

export function getTrendBand(vals: number[]): TrendBand {
  const active = vals.filter(v => v > 0)
  if (active.length < 4) return TREND_BANDS[2]

  const stats = calcTrendStats(vals)
  const pct = stats.latestVsMedian

  return TREND_BANDS.find(b => pct >= b.min && pct < b.max) ?? TREND_BANDS[4]
}

// ── Claude context builder ────────────────────────────────────────────────────

export function buildClaudeContext(
  db: Record<string, RawRow[]>,
  periods: string[]
): string {
  if (periods.length === 0) return 'No referral data available yet.'

  let txt = `You are an analyst assistant for an Oral & Maxillofacial Surgery (OMFS) specialist practice in Sydney, Australia run by Dr Thomas Jaunay. You have been provided the COMPLETE referral dataset below — do not invent or estimate any figures, only use the data provided.\n\n`
  txt += `AVAILABLE QUARTERS: ${periods.join(', ')}\n\n`
  txt += `QUARTERLY SUMMARY:\n`

  for (const p of periods) {
    const rows = db[p] ?? []
    const refs = rows.reduce((s, r) => s + r.referrals, 0)
    const inc = rows.reduce((s, r) => s + r.income, 0)
    txt += `${p}: ${refs} referrals, $${Math.round(inc).toLocaleString()} income, avg $${complexity(refs, inc)}/ref, ${rows.length} active referrers\n`
  }

  // Build complete dentist totals across all periods
  const dentMap: Record<string, { practice: string; specialty: string; totalRefs: number; totalIncome: number; byPeriod: Record<string, number> }> = {}

  for (const p of periods) {
    for (const r of db[p] ?? []) {
      if (!r.referrals) continue
      const key = `${r.referrer}||${r.practice}`
      if (!dentMap[key]) {
        dentMap[key] = { practice: r.practice, specialty: r.specialty, totalRefs: 0, totalIncome: 0, byPeriod: {} }
      }
      dentMap[key].totalRefs += r.referrals
      dentMap[key].totalIncome += r.income
      dentMap[key].byPeriod[p] = (dentMap[key].byPeriod[p] ?? 0) + r.referrals
    }
  }

  const allDents = Object.entries(dentMap)
    .map(([key, d]) => ({ referrer: key.split('||')[0], ...d }))
    .sort((a, b) => b.totalRefs - a.totalRefs)

  txt += `\nCOMPLETE REFERRER LIST (${allDents.length} referrers, sorted by total referrals):\n`
  for (const d of allDents) {
    const byQ = periods.map(p => `${p}:${d.byPeriod[p] ?? 0}`).join(' ')
    txt += `${d.referrer} (${d.practice}): ${d.totalRefs} refs, $${Math.round(d.totalIncome).toLocaleString()} income, avg $${complexity(d.totalRefs, d.totalIncome)}/ref | ${byQ}\n`
  }

  // Practice totals
  const pracMap: Record<string, { totalRefs: number; totalIncome: number }> = {}
  for (const p of periods) {
    for (const r of db[p] ?? []) {
      if (!r.referrals) continue
      if (!pracMap[r.practice]) pracMap[r.practice] = { totalRefs: 0, totalIncome: 0 }
      pracMap[r.practice].totalRefs += r.referrals
      pracMap[r.practice].totalIncome += r.income
    }
  }

  const allPracs = Object.entries(pracMap)
    .map(([practice, d]) => ({ practice, ...d }))
    .sort((a, b) => b.totalRefs - a.totalRefs)

  txt += `\nCOMPLETE PRACTICE LIST (${allPracs.length} practices):\n`
  for (const p of allPracs) {
    txt += `${p.practice}: ${p.totalRefs} refs, $${Math.round(p.totalIncome).toLocaleString()} income, avg $${complexity(p.totalRefs, p.totalIncome)}/ref\n`
  }

  txt += `\nIMPORTANT: Only answer using the data above. Never invent referrer names or figures not present in this dataset.`

  return txt
}
