
import { describe, it, expect } from 'vitest'
import { pgnToGames } from '../src/pgn'

// Helper to build a minimal PGN with evals; assumes comments come after the move
const buildPgn = (moves: string): string => `[Event "Test"]

${moves} 1-0`

describe('PGN parsing', () => {
  it('should parse a PGN string into game objects', () => {
    const pgn = `[Event "Game 1"]

1. e4 e5 *

[Event "Game 2"]

1. d4 d5 *`
    const games = pgnToGames(pgn)
    expect(games).toHaveLength(2)
    expect(games[0].opening.name).toBeFalsy()
    expect(games[1].opening.name).toBeFalsy()
  })
})
