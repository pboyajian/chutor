/* @vitest-environment jsdom */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import MistakeList from '../components/MistakeList'

// Minimal fake games
const baseGames: any[] = [
  { id: 'g1', opening: { name: 'OpA' }, pgn: { raw: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6' }, analysis: [{ ply: 2 }, { ply: 4 }] },
  { id: 'g2', opening: { name: 'OpB' }, pgn: { raw: '1. d4 d5 2. c4 e6 3. Nc3 Nf6' }, analysis: [{ ply: 2 }] },
]

const summary: any = {
  total: { inaccuracies: 1, mistakes: 1, blunders: 1 },
  mistakesByOpening: { OpA: 1, OpB: 1 },
  blundersByOpening: { OpA: 1, OpB: 0 },
  topMistakes: [
    { gameId: 'g1', moveNumber: 3, ply: 5, side: 'white', kind: 'mistake' as const, centipawnLoss: 120 },
  ],
  topBlunders: [
    { gameId: 'g2', moveNumber: 2, ply: 4, side: 'black', centipawnLoss: 300 },
  ],
}

class MockWorker {
  static instances = 0
  onmessage: ((evt: any) => void) | null = null
  onerror: ((err: any) => void) | null = null
  constructor(..._args: any[]) {
    MockWorker.instances += 1
  }
  postMessage(_payload: any) {
    // respond next tick with empty items so component synthesizes minimal items
    setTimeout(() => {
      this.onmessage && this.onmessage({ data: { type: 'result', data: { items: [], recurringPatterns: [], elapsed: 1 } } })
    }, 0)
  }
  terminate() {}
}
;(globalThis as any).Worker = MockWorker as any

describe('MistakeList prep cache', () => {
  it('reuses prepared items without spawning a second worker for same inputs', async () => {
    const onSelect = vi.fn()
    const div = document.createElement('div')
    document.body.appendChild(div)
    const root = createRoot(div)

    root.render(<MistakeList games={baseGames as any} summary={summary} selected={null} onSelect={onSelect} />)
    await new Promise((r) => setTimeout(r, 5))
    const afterFirst = MockWorker.instances

    // Re-render with same props (simulate switching away and back to the same opening)
    root.render(<MistakeList games={baseGames as any} summary={summary} selected={null} onSelect={onSelect} />)
    await new Promise((r) => setTimeout(r, 5))
    const afterSecond = MockWorker.instances

    expect(afterFirst).toBeGreaterThan(0)
    expect(afterSecond).toBe(afterFirst) // second render should hit prep cache and not spawn new worker
  })
})


