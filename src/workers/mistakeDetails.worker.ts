// Web Worker to prepare heavy blunder details for MistakeList
// Receives: { games, blunders }
// Returns: { items, recurringPatterns, progress? }

// We keep types minimal to avoid coupling
export interface WorkerBlunder {
  gameId: string
  moveNumber: number
  ply?: number
  centipawnLoss?: number
}

type VerboseMove = { san: string; from: string; to: string; promotion?: string }

// chess.js is ESM; in Vite worker context we can import normally
import { Chess } from 'chess.js'

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

self.onmessage = (evt: MessageEvent) => {
  const { games, blunders } = evt.data as { games: any[]; blunders: WorkerBlunder[] }

  const start = Date.now()
  const blundersByGame = new Map<string, WorkerBlunder[]>()
  for (const b of blunders) {
    const arr = blundersByGame.get(b.gameId) || []
    arr.push(b)
    blundersByGame.set(b.gameId, arr)
  }

  const items: Array<{
    gameId: string
    moveNumber: number
    centipawnLoss?: number
    playedSan?: string
    bestSan?: string
    opening: string
    fen: string
  }> = []

  const counts: Record<string, number> = {}
  const samples: Record<string, { gameId: string; moveNumber: number; opening: string; move: string; fen: string }> = {}

  // Create quick lookup for games
  const gameMap: Record<string, any> = {}
  for (const g of games as any[]) {
    const id = String(g?.id ?? '')
    if (id) gameMap[id] = g
  }

  let processed = 0

  for (const [gameId, group] of blundersByGame.entries()) {
    const game = gameMap[gameId]
    if (!game) continue
    const opening = String(game?.opening?.name ?? 'Unknown')

    // Prepare needed plies
    const neededPlies = new Set<number>()
    for (const b of group) neededPlies.add((b.moveNumber - 1) * 2)

    // Parse PGN once
    const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
    if (!pgnRaw) continue

    const engine = new Chess()
    engine.loadPgn(pgnRaw)
    const verbose = engine.history({ verbose: true }) as VerboseMove[]

    // Build FENs up to max needed ply
    const maxPly = Math.max(...Array.from(neededPlies))
    const temp = new Chess()
    const fenAtPly = new Map<number, string>()
    fenAtPly.set(0, temp.fen())
    for (let i = 0; i < verbose.length && i <= maxPly; i++) {
      const mv = verbose[i]
      temp.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
      fenAtPly.set(i + 1, temp.fen())
    }

    const analyzed = Array.isArray(game?.analysis) ? (game.analysis as any[]) : []

    for (const b of group) {
      const ply = (b.moveNumber - 1) * 2
      const idx = Math.max(0, Math.min(verbose.length - 1, ply))
      const playedSan = verbose[idx]?.san

      // best SAN from UCI/comment if available
      const targetPly = ((b.moveNumber * 2 - 1) % 2 === 1) ? b.moveNumber * 2 - 1 : b.moveNumber * 2
      const mv = analyzed.find((m: any) => typeof m?.ply === 'number' && m.ply === targetPly)
      const prevFen = fenAtPly.get(targetPly - 1) || fenAtPly.get(ply) || temp.fen()
      let bestSan: string | undefined
      const uci: string | undefined = (mv?.best as string) || (mv?.uciBest as string) || undefined
      if (uci) bestSan = toUciSan(prevFen, uci)
      if (!bestSan) bestSan = extractBestSanFromComment(prevFen, (mv?.judgment?.comment as string | undefined) || (mv?.comment as string | undefined))

      const fen = fenAtPly.get(ply) || temp.fen()

      items.push({ gameId, moveNumber: b.moveNumber, centipawnLoss: b.centipawnLoss, playedSan, bestSan, opening, fen })

      const key = `${opening}||${playedSan ?? '—'}`
      counts[key] = (counts[key] ?? 0) + 1
      if (!samples[key]) {
        samples[key] = { gameId, moveNumber: b.moveNumber, opening, move: playedSan ?? '—', fen }
      }
    }

    processed += group.length
    if (processed % 100 === 0) {
      ;(self as any).postMessage({ type: 'progress', data: { processed } })
    }
  }

  const recurringPatterns = Object.entries(counts)
    .map(([key, count]) => ({ key, count, opening: samples[key].opening, move: samples[key].move, sample: { gameId: samples[key].gameId, moveNumber: samples[key].moveNumber, fen: samples[key].fen } }))
    .sort((a, b) => b.count - a.count)

  const elapsed = Date.now() - start
  ;(self as any).postMessage({ type: 'result', data: { items, recurringPatterns, elapsed } })
}

export {} // keep this a module


