import { describe, it, expect } from 'vitest'
import { prepareMistakeDetails } from '../workers/mistakeDetailsCore'

describe('mistakeDetails core fallback on bad PGN', () => {
  it('emits minimal items when PGN cannot be parsed (e.g. invalid O-O-O)', async () => {
    const games = [
      { id: 'g1', opening: { name: 'OpA' }, pgn: { raw: '1. e4 e5 2. O-O-O??' } },
    ]
    const mistakes = [
      { gameId: 'g1', moveNumber: 2, ply: 4, kind: 'blunder' as const },
    ]
    const data: any = prepareMistakeDetails(games as any[], mistakes as any[])
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.items.length).toBeGreaterThan(0)
    const item = data.items[0]
    expect(typeof item.fen).toBe('string')
    expect(item.opening).toBe('OpA')
  })

  it('does not throw when a verbose move cannot be applied', () => {
    const games = [
      { id: 'g2', opening: { name: 'OpB' }, pgn: { raw: '1. e4 e5 2. Nc3 Nf6 3. a3 a6' } },
    ]
    // Ask for a ply beyond available history to force fenAtPly fallback
    const mistakes = [
      { gameId: 'g2', moveNumber: 50, ply: 100, kind: 'mistake' as const },
    ]
    const data: any = prepareMistakeDetails(games as any[], mistakes as any[])
    expect(Array.isArray(data.items)).toBe(true)
    expect(data.items.length).toBe(1)
    expect(typeof data.items[0].fen).toBe('string')
  })
})


