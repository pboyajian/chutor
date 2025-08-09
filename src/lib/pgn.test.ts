import { describe, it, expect } from 'vitest'
import { parsePgnTextToGames } from './pgn'
import analyzeGames from './analysis'

// Helper to build a minimal PGN with evals; assumes comments come after the move
const buildPgn = (moves: string): string => `[
Event "Test"]

${moves} 1-0`

describe('PGN eval mapping to ply', () => {
  it('attaches eval to the ply that just occurred (single-pass)', () => {
    // 1. e4 { [%eval 0.00] } e5 { [%eval 0.00] } 2. Nf3 { [%eval 0.10] } Nc6 { [%eval 0.10] }
    const pgn = buildPgn('1. e4 { [%eval 0.00] } e5 { [%eval 0.00] } 2. Nf3 { [%eval 0.10] } Nc6 { [%eval 0.10] }')
    const games = parsePgnTextToGames(pgn)
    expect(games).toHaveLength(1)
    const analysis = games[0].analysis
    // Expect four eval entries mapped to plies 1..4 respectively
    expect(analysis.length).toBe(4)
    expect(analysis[0].ply).toBe(1)
    expect(analysis[1].ply).toBe(2)
    expect(analysis[2].ply).toBe(3)
    expect(analysis[3].ply).toBe(4)
    expect(analysis[0].eval?.cp).toBe(0)
    expect(analysis[1].eval?.cp).toBe(0)
    expect(analysis[2].eval?.cp).toBe(10)
    expect(analysis[3].eval?.cp).toBe(10)
  })
})

describe('Mover-centric centipawn loss', () => {
  it('attributes loss to the mover, not the previous move', () => {
    // Scenario: neutral white move remains 0.00, then black blunders to +3.00 (300cp)
    // a5 { [%eval 0.00] } Bxa5 { [%eval 3.00] }
    const pgn = buildPgn('a5 { [%eval 0.00] } Bxa5 { [%eval 3.00] }')
    const games = parsePgnTextToGames(pgn)
    const summary = analyzeGames(games)
    const [b] = summary.topBlunders
    expect(b.ply).toBe(2)
    expect(b.side).toBe('black')
    expect(b.centipawnLoss).toBe(300)
  })

  it('neutral move should have ~0 loss when followed by opponent blunder', () => {
    const pgn = buildPgn('a3 { [%eval 0.00] } Qh4?? { [%eval 2.80] }')
    const games = parsePgnTextToGames(pgn)
    const summary = analyzeGames(games)
    const [b] = summary.topBlunders
    expect(b.ply).toBe(2)
    expect(b.side).toBe('black')
    expect(b.centipawnLoss).toBe(280)
  })

  it('handles mate evals gracefully by skipping them in loss calc', () => {
    const pgn = buildPgn('Rxe8 { [%eval 0.00] } Qxe8# { [%eval #3] }')
    const games = parsePgnTextToGames(pgn)
    const summary = analyzeGames(games)
    // No numeric cp change should be attributed when mate is present; nothing should crash.
    expect(Array.isArray(summary.topBlunders)).toBe(true)
  })
})
