import type { LichessGame } from './lichess'

function extractHeader(tag: string, text: string): string | undefined {
  const m = new RegExp(`\\[${tag}\\s+"([^"]+)"\\]`).exec(text)
  return m?.[1]
}

function parseEvalTokens(movesSection: string) {
  // Single-pass tokenizer that increments ply on SAN tokens and attaches evals
  // to the ply that just occurred. This prevents misalignment between evals
  // and moves.
  const evals: Array<{ cp?: number; mate?: number; ply: number }> = []

  // Matches either a comment block or the next non-space token
  const tokenRegex = /\{[^}]*\}|\S+/g
  let match: RegExpExecArray | null
  let plyCounter = 0

  const isMoveToken = (t: string): boolean => {
    // Exclude move numbers (e.g., 12. or 12...)
    if (/^\d+\.(\.\.)?$/.test(t)) return false
    // Exclude results
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t)) return false
    // Exclude NAGs like $1
    if (/^\$\d+$/.test(t)) return false
    // Exclude pure parentheses from variations
    if (t === '(' || t === ')') return false
    // Some exports glue parentheses to tokens; strip them for detection purposes
    const stripped = t.replace(/[()]+/g, '')
    if (!stripped) return false
    // If it still looks like a number token, ignore
    if (/^\d+\.(\.\.)?$/.test(stripped)) return false
    // Anything else treat as a move token (SAN is quite permissive)
    return true
  }

  while ((match = tokenRegex.exec(movesSection))) {
    const tok = match[0]

    // Comment block: look for [%eval ...]
    if (tok.startsWith('{')) {
      const em = /\[\s*%eval\s+([^\]\s]+)\s*\]/i.exec(tok)
      if (em) {
        const raw = em[1]
        const record: { cp?: number; mate?: number; ply: number } = { ply: plyCounter }
        if (raw.startsWith('#')) {
          const mateNum = Number(raw.slice(1).replace('+', ''))
          if (!Number.isNaN(mateNum)) record.mate = mateNum
        } else {
          const cp = Math.round(Number(raw) * 100)
          if (!Number.isNaN(cp)) record.cp = cp
        }
        evals.push(record)
      }
      continue
    }

    // Non-comment token: increment ply if it appears to be a SAN move token
    if (isMoveToken(tok)) {
      plyCounter += 1
    }
  }

  return evals
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


