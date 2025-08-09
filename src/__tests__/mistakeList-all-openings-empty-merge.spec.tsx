import React from 'react'
import { describe, it, expect } from 'vitest'
import MistakeList from '../components/MistakeList'
import { renderToString } from 'react-dom/server'

describe('All openings – Recurrence panel populates when totals exist (TDD repro)', () => {
  it('fails today: totals > 0 but top arrays empty → panel should still populate', async () => {
    const games: any[] = [
      { id: 'g1', opening: { name: 'OpA' }, pgn: { raw: '' } },
      { id: 'g2', opening: { name: 'OpB' }, pgn: { raw: '' } },
    ]
    const summary: any = {
      total: { blunders: 2, mistakes: 3, inaccuracies: 1 },
      mistakesByOpening: { OpA: 3, OpB: 3 },
      blundersByOpening: { OpA: 2, OpB: 0 },
      topMistakes: [],
      topBlunders: [],
    }

    const html = renderToString(
      <MistakeList games={games as any} summary={summary} selected={null} onSelect={() => {}} />,
    )

    // Expectation for desired behavior (will FAIL with current implementation):
    // When totals indicate mistakes exist, the panel should not be empty on first render
    const text = html
    expect(text.includes('No mistakes identified.')).toBe(false)
    expect(text.includes('No recurring mistakes found.')).toBe(false)
  })
})


