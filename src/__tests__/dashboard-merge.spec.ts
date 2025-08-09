import { describe, it, expect } from 'vitest'
import { analyzeGames } from '../lib/analysis'

type Game = any

function mk(id: string, opening: string, analysis: any[]): Game {
  return { id, opening: { name: opening }, analysis }
}

describe('Per-opening merge for pie totals', () => {
  it('keeps original mistakes and merges bootstrapped deltas', () => {
    const games: Game[] = [
      mk('1', 'OpA', [
        { ply: 1, judgment: { name: 'mistake', cp: 150 } },
      ]),
      mk('2', 'OpA', [
        { ply: 1 },
      ]),
    ]
    const base = analyzeGames(games)
    // Simulate bootstrapped new mistake on game 2
    const summaryWithBoot = {
      ...base,
      topMistakes: [
        ...base.topMistakes,
        { gameId: '2', moveNumber: 1, ply: 1, side: 'white' as const, kind: 'mistake' as const, bootstrapped: true },
      ],
    }
    // Count combined
    const combinedTotal = summaryWithBoot.topMistakes.filter((m: any) => m.kind === 'mistake').length
    expect(combinedTotal).toBe(2)
  })

  it('filters out Chess960/variant games in analysis', () => {
    const games: Game[] = [
      { id: '1', opening: { name: 'StdOp' }, variant: 'standard', analysis: [{ ply: 1, judgment: { name: 'mistake', cp: 120 } }] },
      { id: '2', opening: { name: 'Fischer Random' }, variant: 'chess960', analysis: [{ ply: 1, judgment: { name: 'mistake', cp: 120 } }] },
    ]
    const base = analyzeGames(games as any)
    expect(base.total.mistakes + base.total.blunders + base.total.inaccuracies).toBe(1)
  })

  it('skips games where opening name is "?"', () => {
    const games: Game[] = [
      { id: '1', opening: { name: '?' }, analysis: [{ ply: 1, judgment: { name: 'mistake', cp: 120 } }] },
      { id: '2', opening: { name: 'Std' }, analysis: [{ ply: 1, judgment: { name: 'mistake', cp: 120 } }] },
    ]
    const base = analyzeGames(games as any)
    expect(base.total.mistakes + base.total.blunders + base.total.inaccuracies).toBe(1)
    expect(base.mistakesByOpening['?']).toBeUndefined()
  })

  it('performance guard: synthetic merge up to ~2500 completes quickly (logic-only)', async () => {
    const big: Game[] = []
    for (let i = 0; i < 2500; i++) {
      big.push(mk(String(i), 'OpZ', [{ ply: 1, judgment: { name: i % 2 ? 'blunder' : 'mistake', cp: 200 } }]))
    }
    const t0 = performance.now()
    const base = analyzeGames(big)
    const t1 = performance.now()
    // sanity
    expect(base.total.mistakes + base.total.blunders + base.total.inaccuracies).toBeGreaterThan(0)
    const elapsed = t1 - t0
    // CI-friendly loose bound
    expect(elapsed).toBeLessThan(2000)
  })
})


