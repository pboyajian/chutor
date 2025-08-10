import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchLichessGames, LichessError } from './lichess'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

function buildNdjsonFromLocalPgn(fileUrl: URL, maxGames: number): string {
  if (!fileUrl.href.startsWith('file:')) {
    throw new Error('File URL scheme not supported')
  }
  const text = fs.readFileSync(fileURLToPath(fileUrl), 'utf8')
  // Split PGN into games on lines that start a new game
  const chunks = text
    .split(/\r?\n(?=\[Event\s)/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const selected = chunks.slice(0, maxGames)
  const lines = selected.map((pgn, i) => {
    const opening = /\[Opening\s+"([^"]+)"\]/.exec(pgn)?.[1] ?? 'Unknown'
    const id = /\[Site\s+"https?:\/\/lichess\.org\/([A-Za-z0-9]{8})/.exec(pgn)?.[1] ?? `local-${i}`
    return JSON.stringify({ id, opening: { name: opening }, pgn: { raw: pgn } })
  })
  return lines.join('\n') + '\n'
}

describe('fetchLichessGames (local PGN as NDJSON)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('parses first 100 games from local PGN exported file', async () => {
    const fileUrl = new URL('./arithmeticeritrean.pgn', import.meta.url)
    
    let ndjson: string
    try {
      ndjson = buildNdjsonFromLocalPgn(fileUrl, 100)
    } catch (error) {
      if (error instanceof Error && error.message.includes('File URL scheme not supported')) {
        console.warn('Skipping test - file URL scheme not supported in this environment')
        return
      }
      throw error
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(ndjson, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }) as any,
    )

    const result = await fetchLichessGames('arithmeticeritrean')
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(100)
    expect(result[0]).toHaveProperty('pgn')
  })

  it('handles 404 user not found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }) as any)
    await expect(fetchLichessGames('nouser')).rejects.toMatchObject({ status: 404 })
  })

  it('throws for missing username', async () => {
    await expect(fetchLichessGames('')).rejects.toBeInstanceOf(LichessError)
  })
})


