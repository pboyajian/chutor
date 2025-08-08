import type { LichessGame } from './lichess'

function extractHeader(tag: string, text: string): string | undefined {
  const m = new RegExp(`\\[${tag}\\s+"([^"]+)"\\]`).exec(text)
  return m?.[1]
}

function parseEvalTokens(movesSection: string) {
  // Lichess PGN embeds evaluations as comments like: { [%eval 0.56] } or { [%eval #-3] }
  const evalRegex = /\{\s*\[%eval\s+([^\]\s]+)\s*\]\s*\}/g
  const evals: Array<{ cp?: number; mate?: number; ply: number }> = []

  // Very lightweight ply counter: increment on SAN move tokens
  // SAN tokens roughly: piece moves, captures, checks, mates, promotions, castles
  const tokens = movesSection
    .replace(/\{[^}]*\}/g, ' ') // strip comments for ply counting
    .split(/\s+/)
    .filter(Boolean)

  let plyCounter = 0
  const isMoveToken = (t: string) => !/^\d+\.|^\d+\.\.\./.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)

  // Walk once to build a map of where evals appear relative to tokens
  // Then do a second pass with regex to capture eval numbers in order and assign ply order
  for (const tok of tokens) {
    if (isMoveToken(tok)) plyCounter += 1
  }

  // Second pass: assign sequential ply indices for each eval we encounter
  let evalIndex = 0
  const seq: Array<{ cp?: number; mate?: number; ply: number }> = []
  movesSection.replace(evalRegex, (_m) => {
    evalIndex += 1
    // Map 1-based index to ply; use evalIndex as an approximation
    seq.push({ ply: evalIndex })
    return _m
  })

  // Now actually extract numeric values and attach to seq entries
  let i = 0
  let m: RegExpExecArray | null
  while ((m = evalRegex.exec(movesSection))) {
    const raw = m[1]
    const target = seq[i++]
    if (!target) break
    if (raw.startsWith('#')) {
      const mateNum = Number(raw.slice(1).replace('+', ''))
      target.mate = isNaN(mateNum) ? undefined : mateNum
    } else {
      const cp = Math.round(Number(raw) * 100)
      target.cp = isNaN(cp) ? undefined : cp
    }
  }
  return seq
}

export function parsePgnTextToGames(text: string, max?: number): LichessGame[] {
  const chunks = text
    .split(/\r?\n(?=\[Event\s)/g)
    .map((s) => s.trim())
    .filter(Boolean)
  const selected = typeof max === 'number' ? chunks.slice(0, max) : chunks

  return selected.map((pgn, idx) => {
    const opening = extractHeader('Opening', pgn) ?? 'Unknown'
    const site = extractHeader('Site', pgn)
    const id = site && /lichess\.org\/([A-Za-z0-9]{8})/.exec(site)?.[1]
    const sepIndex = pgn.indexOf('\n\n')
    const movesSection = sepIndex >= 0 ? pgn.slice(sepIndex + 2) : pgn
    const evals = parseEvalTokens(movesSection)
    return {
      id: id ?? `local-${idx}`,
      opening: { name: opening },
      pgn: { raw: pgn },
      analysis: evals.map((e) => ({ ply: e.ply, eval: e.mate ? { mate: e.mate } : { cp: e.cp } })),
    } as LichessGame
  })
}

export async function pgnFileToGames(file: File, max?: number): Promise<LichessGame[]> {
  const text = await file.text()
  return parsePgnTextToGames(text, max)
}

export default parsePgnTextToGames


