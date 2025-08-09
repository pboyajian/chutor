import { describe, it, expect } from 'vitest'
import { computeDatasetKey } from '../datasetHash'

describe('computeDatasetKey', () => {
  it('stable for same data irrespective of order', () => {
    const games = [
      { id: 'b', opening: { name: 'Pirc' }, analysis: [{}, {}] },
      { id: 'a', opening: { name: 'Ruy' }, analysis: [{}] },
    ]
    const k1 = computeDatasetKey(games as any, { onlyForUsername: 'u' })
    const k2 = computeDatasetKey([...games].reverse() as any, { onlyForUsername: 'u' })
    expect(k1).toBe(k2)
  })
  it('changes with option differences', () => {
    const games = [{ id: 'x', opening: { name: 'Sicilian' }, analysis: [] }]
    const k1 = computeDatasetKey(games as any, { onlyForUsername: 'a' })
    const k2 = computeDatasetKey(games as any, { onlyForUsername: 'b' })
    expect(k1).not.toBe(k2)
  })
})


