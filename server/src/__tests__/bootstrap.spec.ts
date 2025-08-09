import { describe, it, expect } from 'vitest'
// Import the TS source directly when running in the server package
// In runtime, worker uses the compiled JS; tests target the TS module export
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { analyzeGames as analyzeServer } from '../analysis'

// Minimal helpers for building fake games
function game(id: string, opening: string, analysis: any[], pgn?: string) {
  return { id, opening: { name: opening }, analysis, ...(pgn ? { pgn: { raw: pgn } } : {}) }
}

// PGN with a few moves for FEN indexing
const SIMPLE_PGN = `
[Event "?"]
[Site "?"]
[White "w"]
[Black "b"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7
`

describe('Bootstrapping per opening (server)', () => {
  it('builds FEN index from evaluated games and applies to unevaluated ones (same opening)', () => {
    // Evaluated game with a blunder at ply 6 (3...Bb5) – synthesize a loss >=250
    const evalGame = game('A', 'Test Opening', [
      { ply: 1, eval: { cp: 0 } },
      { ply: 2, eval: { cp: 0 } },
      { ply: 3, eval: { cp: 0 } },
      { ply: 4, eval: { cp: 300 } }, // from white perspective
    ], SIMPLE_PGN)

    // Unevaluated game (no evals/judgments) reaching same position
    const unevalGame = game('B', 'Test Opening', [
      { ply: 1 }, { ply: 2 }, { ply: 3 }, { ply: 4 }
    ], SIMPLE_PGN)

    const summary = analyzeServer([evalGame, unevalGame], { bootstrapOpening: 'Test Opening' })
    expect(summary.total.blunders + summary.total.mistakes + summary.total.inaccuracies).toBeGreaterThan(0)
    expect(Array.isArray(summary.topMistakes)).toBe(true)
    // Ensure bootstrapped appears for the unevaluated game
    const hasBoot = summary.topMistakes.some((m: any) => m.gameId === 'B' && (m as any).bootstrapped)
    expect(hasBoot).toBe(true)
  })

  it('does not bootstrap when opening filter is different', () => {
    const evalGame = game('A', 'Opening X', [
      { ply: 1, eval: { cp: 0 } }, { ply: 2, eval: { cp: 300 } },
    ], SIMPLE_PGN)
    const unevalGame = game('B', 'Opening Y', [{ ply: 1 }, { ply: 2 }], SIMPLE_PGN)
    const summary = analyzeServer([evalGame, unevalGame], { bootstrapOpening: 'Opening X' })
    // No bootstrapped for game B because it is not in selected opening
    const hasBoot = summary.topMistakes?.some((m: any) => m.gameId === 'B' && (m as any).bootstrapped)
    expect(hasBoot).not.toBe(true)
  })
})


