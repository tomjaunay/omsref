// Supabase (PostgREST) returns at most 1000 rows per request by default, silently.
// Use this for any table that can grow past that — e.g. referrer_rows (~200 referrers × many quarters).
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return out
}
