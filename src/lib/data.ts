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

// ── Trend bands ───────────────────────────────────────────────────────────────

export interface TrendBand {
  min: number; max: number
  stroke: string; pillClass: string; label: string; swatch: string
}

export const TREND_BANDS: TrendBand[] = [
  { min: 20,        max: Infinity, stroke: '#1a7a35', pillClass: 'pill-up2',  label: 'Strong up',   swatch: '#1a7a35' },
  { min: 5,         max: 20,       stroke: '#6aaa6a', pillClass: 'pill-up1',  label: 'Mild up',     swatch: '#6aaa6a' },
  { min: -5,        max: 5,        stroke: '#c89a00', pillClass: 'pill-flat', label: 'Flat',        swatch: '#c89a00' },
  { min: -20,       max: -5,       stroke: '#d4732a', pillClass: 'pill-dn1',  label: 'Mild down',   swatch: '#d4732a' },
  { min: -Infinity, max: -20,      stroke: '#b33030', pillClass: 'pill-dn2',  label: 'Strong down', swatch: '#b33030' },
]

export function getTrendBand(vals: number[]): TrendBand {
  const nz = vals.filter(v => v > 0)
  if (nz.length < 2) return TREND_BANDS[2]
  const pct = (nz[nz.length - 1] - nz[0]) / nz[0] * 100
  return TREND_BANDS.find(b => pct >= b.min && pct < b.max) ?? TREND_BANDS[4]
}

// ── Claude context builder ────────────────────────────────────────────────────

export function buildClaudeContext(
  db: Record<string, RawRow[]>,
  periods: string[]
): string {
  let txt = `You are an analyst assistant for an Oral & Maxillofacial Surgery (OMFS) specialist practice in Sydney, Australia. You have access to referral data across ${periods.length} quarters.\n\n`
  txt += `AVAILABLE QUARTERS: ${periods.join(', ')}\n\nQUARTERLY SUMMARY:\n`
  for (const p of periods) {
    const rows = db[p] ?? []
    const refs = rows.reduce((s, r) => s + r.referrals, 0)
    const inc = rows.reduce((s, r) => s + r.income, 0)
    txt += `${p}: ${refs} referrals, $${Math.round(inc).toLocaleString()} income, avg $${complexity(refs, inc)}/ref, ${rows.length} active referrers\n`
  }
  txt += `\nTOP REFERRERS:\n`
  const dents = buildDentistTable(db, periods, 'totalRefs', 'desc').slice(0, 20)
  for (const d of dents) {
    const qvals = periods.map(p => d.pd[p]?.refs ?? 0)
    txt += `${d.referrer} (${d.practice}): ${d.totalRefs} refs, $${Math.round(d.totalIncome).toLocaleString()} income, avg $${d.totalComplex}/ref — by qtr: ${qvals.join(', ')}\n`
  }
  txt += `\nTOP PRACTICES:\n`
  const pracs = buildPracticeTable(db, periods, 'totalRefs', 'desc').slice(0, 15)
  for (const p of pracs) {
    const qvals = periods.map(period => p.pd[period]?.refs ?? 0)
    txt += `${p.practice}: ${p.totalRefs} refs, $${Math.round(p.totalIncome).toLocaleString()} income, avg $${p.totalComplex}/ref — by qtr: ${qvals.join(', ')}\n`
  }
  return txt
}
