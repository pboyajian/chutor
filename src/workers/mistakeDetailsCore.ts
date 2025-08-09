import { Chess } from 'chess.js'

export interface WorkerMistake {
  gameId: string
  moveNumber: number
  ply?: number
  centipawnLoss?: number
  kind?: 'inaccuracy' | 'mistake' | 'blunder'
}

type VerboseMove = { san: string; from: string; to: string; promotion?: string }

function toUciSan(prevFen: string, uci: string): string | undefined {
  try {
    const engine = new Chess(prevFen)
    const move = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
    }
    const res = engine.move(move as any)
    return res ? (res as any).san : undefined
  } catch {
    return undefined
  }
}

function extractBestSanFromComment(prevFen: string, comment?: string): string | undefined {
  if (!comment) return undefined
  const engine = new Chess(prevFen)
  const candidates = comment.match(/(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)/g) || []
  for (const cand of candidates) {
    try {
      const copy = new Chess(prevFen)
      const res = copy.move(cand)
      if (res) return (res as any).san
    } catch {
      // ignore
    }
  }
  return undefined
}

export function prepareMistakeDetails(
  games: any[],
  mistakes: WorkerMistake[],
): { items: Array<any>; recurringPatterns: Array<any> } {
  const mistakesByGame = new Map<string, WorkerMistake[]>()
  for (const m of mistakes) {
    const arr = mistakesByGame.get(m.gameId) || []
    arr.push(m)
    mistakesByGame.set(m.gameId, arr)
  }

  const items: Array<{
    gameId: string
    moveNumber: number
    centipawnLoss?: number
    kind?: 'inaccuracy' | 'mistake' | 'blunder'
    playedSan?: string
    bestSan?: string
    opening: string
    fen: string
    bootstrapped?: boolean
  }> = []

  const counts: Record<string, number> = {}
  const samples: Record<string, { gameId: string; moveNumber: number; opening: string; move: string; fen: string }> = {}

  const gameMap: Record<string, any> = {}
  for (const g of games as any[]) {
    const id = String(g?.id ?? '')
    if (id) gameMap[id] = g
  }

  const allEntries = Array.from(mistakesByGame.entries())
  for (const [gameId, group] of allEntries) {
    const game = gameMap[gameId]
    if (!game) continue
    const opening = String(game?.opening?.name ?? 'Unknown')

    const neededPlies = new Set<number>()
    for (const b of group) {
      const ply = typeof b.ply === 'number' && b.ply > 0 ? b.ply : Math.max(1, (b.moveNumber - 1) * 2 + 1)
      neededPlies.add(ply)
    }

    const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
    if (!pgnRaw) {
      for (const b of group) {
        const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        items.push({ gameId, moveNumber: b.moveNumber, centipawnLoss: b.centipawnLoss, kind: b.kind, opening, fen })
        const key = `${opening}||—`
        counts[key] = (counts[key] ?? 0) + 1
        if (!samples[key]) samples[key] = { gameId, moveNumber: b.moveNumber, opening, move: '—', fen }
      }
      continue
    }

    let verbose: VerboseMove[] | null = null
    try {
      const engine = new Chess()
      // tolerate noisy PGNs
      ;(engine as any).loadPgn(pgnRaw, { sloppy: true })
      verbose = engine.history({ verbose: true }) as VerboseMove[]
    } catch {
      for (const b of group) {
        const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        items.push({ gameId, moveNumber: b.moveNumber, centipawnLoss: b.centipawnLoss, kind: b.kind, opening, fen })
        const key = `${opening}||—`
        counts[key] = (counts[key] ?? 0) + 1
        if (!samples[key]) samples[key] = { gameId, moveNumber: b.moveNumber, opening, move: '—', fen }
      }
      continue
    }

    const mFen = /\[FEN\s+"([^"]+)"\]/.exec(pgnRaw)
    const startFen: string | undefined = mFen?.[1]
    const maxPly = Math.max(...Array.from(neededPlies))
    const temp = new Chess(startFen || undefined)
    const fenAtPly = new Map<number, string>()
    fenAtPly.set(0, temp.fen())
    for (let i = 0; i < (verbose as VerboseMove[]).length && i <= maxPly; i++) {
      const mv = (verbose as VerboseMove[])[i]
      try {
        temp.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
        fenAtPly.set(i + 1, temp.fen())
      } catch {
        // If a move cannot be applied (malformed history), stop advancing and keep last known FEN
        // Do not throw; downstream will fallback to default FEN when missing
        break
      }
    }

    const analyzed = Array.isArray(game?.analysis) ? (game.analysis as any[]) : []

    for (const b of group) {
      const ply = typeof b.ply === 'number' && b.ply > 0 ? b.ply : Math.max(1, (b.moveNumber - 1) * 2 + 1)
      const idx = Math.max(0, Math.min((verbose as VerboseMove[]).length - 1, ply - 1))
      const playedSan = (verbose as VerboseMove[])[idx]?.san

      const targetPly = ply
      const mv = analyzed.find((m: any) => typeof m?.ply === 'number' && m.ply === targetPly)
      const prevFen = fenAtPly.get(targetPly - 1) || temp.fen()
      let bestSan: string | undefined
      const uci: string | undefined = (mv?.best as string) || (mv?.uciBest as string) || undefined
      if (uci) bestSan = toUciSan(prevFen, uci)
      if (!bestSan) bestSan = extractBestSanFromComment(prevFen, (mv?.judgment?.comment as string | undefined) || (mv?.comment as string | undefined))

      const fen = fenAtPly.get(ply) || temp.fen()

      items.push({ gameId, moveNumber: b.moveNumber, centipawnLoss: b.centipawnLoss, kind: b.kind, playedSan, bestSan, opening, fen })

      const key = `${opening}||${playedSan ?? '—'}`
      counts[key] = (counts[key] ?? 0) + 1
      if (!samples[key]) {
        samples[key] = { gameId, moveNumber: b.moveNumber, opening, move: playedSan ?? '—', fen }
      }
    }
  }

  const recurringPatterns = Object.entries(counts)
    .map(([key, count]) => ({ key, count, opening: samples[key].opening, move: samples[key].move, sample: { gameId: samples[key].gameId, moveNumber: samples[key].moveNumber, fen: samples[key].fen } }))
    .sort((a, b) => b.count - a.count)

  return { items, recurringPatterns }
}


