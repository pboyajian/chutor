import { describe, it, expect } from 'vitest'

describe('MistakeList merge source', () => {
  it('dedupes blunders present in both topMistakes and topBlunders', () => {
    const summary: any = {
      topMistakes: [
        { gameId: 'g1', ply: 10, moveNumber: 5, side: 'white', kind: 'blunder' },
      ],
      topBlunders: [
        { gameId: 'g1', ply: 10, moveNumber: 5, side: 'white', centipawnLoss: 300 },
        { gameId: 'g2', ply: 8, moveNumber: 4, side: 'black', centipawnLoss: 260 },
      ],
    }
    // Emulate merged source logic
    const merged: any[] = []
    const seen = new Set<string>()
    for (const m of summary.topMistakes) {
      const key = `${String(m.gameId)}#${Number(m.ply)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(m)
    }
    for (const b of summary.topBlunders) {
      const key = `${String(b.gameId)}#${Number(b.ply)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ ...b, kind: 'blunder' as const })
    }
    // g1#10 must appear once; g2#8 must be included
    const keys = merged.map((x) => `${x.gameId}#${x.ply}`).sort()
    expect(keys).toEqual(['g1#10', 'g2#8'])
  })

  it('all openings initial population when only topBlunders exist', () => {
    const summary: any = {
      topMistakes: [],
      topBlunders: [
        { gameId: 'g1', ply: 12, moveNumber: 6, side: 'white', centipawnLoss: 400 },
      ],
    }
    const merged: any[] = []
    const seen = new Set<string>()
    const tm: any[] = Array.isArray(summary.topMistakes) ? summary.topMistakes : []
    const tb: any[] = Array.isArray(summary.topBlunders) ? summary.topBlunders : []
    for (const m of tm) {
      const key = `${String(m.gameId)}#${Number(m.ply)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(m)
    }
    for (const b of tb) {
      const key = `${String(b.gameId)}#${Number(b.ply)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ ...b, kind: 'blunder' as const })
    }
    expect(merged.length).toBe(1)
    expect(merged[0].kind).toBe('blunder')
  })

  it('all openings initial population when only topMistakes exist', () => {
    const summary: any = {
      topMistakes: [
        { gameId: 'g1', ply: 14, moveNumber: 7, side: 'black', kind: 'mistake' },
      ],
      topBlunders: [],
    }
    const merged: any[] = []
    const seen = new Set<string>()
    const tm: any[] = Array.isArray(summary.topMistakes) ? summary.topMistakes : []
    const tb: any[] = Array.isArray(summary.topBlunders) ? summary.topBlunders : []
    for (const m of tm) {
      const key = `${String(m.gameId)}#${Number(m.ply)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(m)
    }
    for (const b of tb) {
      const key = `${String(b.gameId)}#${Number(b.ply)}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ ...b, kind: 'blunder' as const })
    }
    expect(merged.length).toBe(1)
    expect(merged[0].kind).toBe('mistake')
  })
})


