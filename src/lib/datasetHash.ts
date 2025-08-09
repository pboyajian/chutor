// Fast dataset hash for client-side caching
// Uses ids, openings, and analysis length plus options subset

export function computeDatasetKey(
  games: any[],
  options: { onlyForUsername?: string; bootstrapOpening?: string } = {},
): string {
  // Build canonical array of [id, opening, analysisLen] and sort by id
  const arr = (games || []).map((g: any) => [
    String(g?.id ?? ''),
    String(g?.opening?.name ?? 'Unknown'),
    Array.isArray(g?.analysis) ? g.analysis.length : 0,
  ])
  arr.sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
  const payload = { g: arr, o: { onlyForUsername: options.onlyForUsername || '', bootstrapOpening: options.bootstrapOpening || '' } }
  const json = JSON.stringify(payload)
  // Roll into a 64-bit hash for speed
  let rolling = BigInt(1469598103934665603) // FNV offset
  const prime = BigInt(1099511628211)
  for (let i = 0; i < json.length; i++) {
    rolling ^= BigInt(json.charCodeAt(i) & 0xff)
    rolling *= prime
    rolling &= (BigInt(1) << BigInt(64)) - BigInt(1)
  }
  return rolling.toString(16).padStart(16, '0')
}


