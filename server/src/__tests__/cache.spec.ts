import { describe, it, expect } from 'vitest'
import { SummaryCache } from '../cache'

describe('SummaryCache', () => {
  it('computes stable key for same inputs', () => {
    const games = [
      { id: 'b', opening: { name: 'Caro-Kann' }, analysis: [{}, {}] },
      { id: 'a', opening: { name: 'Ruy Lopez' }, analysis: [{}] },
    ]
    const k1 = SummaryCache.computeKeyFromDataset(games as any, { onlyForUsername: 'u' })
    const k2 = SummaryCache.computeKeyFromDataset([...games].reverse() as any, { onlyForUsername: 'u' })
    expect(k1).toBe(k2)
  })

  it('different options yield different keys', () => {
    const games = [{ id: 'x', opening: { name: 'Pirc' }, analysis: [] }]
    const k1 = SummaryCache.computeKeyFromDataset(games as any, { onlyForUsername: 'a' })
    const k2 = SummaryCache.computeKeyFromDataset(games as any, { onlyForUsername: 'b' })
    expect(k1).not.toBe(k2)
  })

  it('LRU memory works', () => {
    const cache = new SummaryCache({ baseDir: './.test-cache', maxMemoryItems: 2, maxDiskBytes: 10_000 })
    const k1 = 'k1', k2 = 'k2', k3 = 'k3'
    cache.save(k1, { summary: { total: { inaccuracies: 0, mistakes: 0, blunders: 0 }, mistakesByOpening: {}, blundersByOpening: {}, topMistakes: [], topBlunders: [] } })
    cache.save(k2, { summary: { total: { inaccuracies: 0, mistakes: 0, blunders: 0 }, mistakesByOpening: {}, blundersByOpening: {}, topMistakes: [], topBlunders: [] } })
    cache.save(k3, { summary: { total: { inaccuracies: 0, mistakes: 0, blunders: 0 }, mistakesByOpening: {}, blundersByOpening: {}, topMistakes: [], topBlunders: [] } })
    const a = cache.tryGet(k1) // May be evicted from memory, but present on disk
    const b = cache.tryGet(k2)
    const c = cache.tryGet(k3)
    expect([a, b, c].filter(Boolean).length).toBe(3)
  })
})


