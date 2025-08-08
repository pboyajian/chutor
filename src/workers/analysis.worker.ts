import type { LichessGame } from '../lib/lichess'
import type { AnalysisSummary } from '../lib/analysis'

interface AnalysisMessage {
  type: 'analyze'
  games: LichessGame[]
  options: { onlyForUsername?: string }
}

interface ProgressMessage {
  type: 'progress'
  current: number
  total: number
  phase: string
}

interface DebugMessage {
  type: 'debug'
  message: string
  timestamp: number
  data?: any
}

interface ResultMessage {
  type: 'result'
  summary: AnalysisSummary
}

type WorkerMessage = AnalysisMessage
type WorkerResponse = ProgressMessage | ResultMessage | DebugMessage

function log(message: string, data?: any) {
  const timestamp = performance.now()
  self.postMessage({ type: 'debug', message, timestamp, data })
}

function extractGameNames(game: any): { white?: string; black?: string } {
  const fromPgn = (raw?: string, tag?: string): string | undefined => {
    if (!raw || !tag) return undefined
    const m = new RegExp(`\\[${tag}\\s+"([^"]+)"\\]`).exec(raw)
    return m?.[1]
  }
  const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
  const white =
    ((game?.players?.white?.user?.name as string | undefined) ||
      (game?.players?.white?.userId as string | undefined) ||
      (game?.players?.white?.name as string | undefined) ||
      (game?.white?.user?.name as string | undefined) ||
      (game?.white?.name as string | undefined) ||
      fromPgn(pgnRaw, 'White'))
  const black =
    ((game?.players?.black?.user?.name as string | undefined) ||
      (game?.players?.black?.userId as string | undefined) ||
      (game?.players?.black?.name as string | undefined) ||
      (game?.black?.user?.name as string | undefined) ||
      (game?.black?.name as string | undefined) ||
      fromPgn(pgnRaw, 'Black'))
  return { white, black }
}

function deriveUsernameFromGames(all: LichessGame[]): string | undefined {
  const startTime = performance.now()
  log('Starting username derivation', { gameCount: all.length })
  
  const counts = new Map<string, number>()
  for (const g of all as any[]) {
    const names = extractGameNames(g)
    const set = new Set<string>()
    for (const name of [names.white, names.black]) {
      if (typeof name === 'string' && name.trim()) set.add(name.trim().toLowerCase())
    }
    for (const n of set) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = 0
  for (const [n, c] of counts.entries()) {
    if (c > bestCount) {
      best = n
      bestCount = c
    }
  }
  if (best && bestCount === all.length) return best
  
  const duration = performance.now() - startTime
  log('Username derivation completed', { duration, result: best, bestCount, totalGames: all.length })
  return best
}

async function analyzeGamesWithProgress(
  games: LichessGame[], 
  options: { onlyForUsername?: string } = {},
  postMessage: (message: WorkerResponse) => void
): Promise<AnalysisSummary> {
  const totalStartTime = performance.now()
  log('Starting analysis', { gameCount: games.length, options })
  
  const total = games.length
  let current = 0
  const updateInterval = Math.max(1, Math.floor(total / 20)) // Update every 5% or at least every game
  
  postMessage({ type: 'progress', current: 0, total, phase: 'Analyzing games' })
  
  const summary: AnalysisSummary = {
    total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
    mistakesByOpening: {},
    blundersByOpening: {},
    topBlunders: [],
  }
  
  const normalizedTarget = options.onlyForUsername?.trim().toLowerCase() || ''
  log('Analysis target', { normalizedTarget })
  
  let gameAnalysisTime = 0
  let moveProcessingTime = 0
  let judgmentProcessingTime = 0
  
  for (const game of games) {
    const gameStartTime = performance.now()
    current += 1
    
    if (current % updateInterval === 0) {
      postMessage({ type: 'progress', current, total, phase: 'Analyzing games' })
      log('Progress update', { current, total, phase: 'Analyzing games' })
      // Small delay to allow UI updates
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    const openingName = String((game as any)?.opening?.name ?? 'Unknown')
    const analyzedMoves: any[] = Array.isArray((game as any)?.analysis)
      ? ((game as any).analysis as any[])
      : []
    
    const hasJudgments = analyzedMoves.some((mv) => mv?.judgment?.name)
    
    // Determine which side (white/black) the target username is playing in this game, if provided
    let targetSide: 'white' | 'black' | null = null
    if (normalizedTarget) {
      const sideStartTime = performance.now()
      const whiteName: string | undefined =
        ((game as any)?.players?.white?.user?.name as string | undefined) ||
        ((game as any)?.players?.white?.userId as string | undefined) ||
        ((game as any)?.players?.white?.name as string | undefined) ||
        ((game as any)?.white?.user?.name as string | undefined) ||
        ((game as any)?.white?.name as string | undefined) ||
        ((game as any)?.pgn?.raw && /\[White\s+"([^"]+)"\]/.exec((game as any).pgn.raw)?.[1])
      const blackName: string | undefined =
        ((game as any)?.players?.black?.user?.name as string | undefined) ||
        ((game as any)?.players?.black?.userId as string | undefined) ||
        ((game as any)?.players?.black?.name as string | undefined) ||
        ((game as any)?.black?.user?.name as string | undefined) ||
        ((game as any)?.black?.name as string | undefined) ||
        ((game as any)?.pgn?.raw && /\[Black\s+"([^"]+)"\]/.exec((game as any).pgn.raw)?.[1])
      if (typeof whiteName === 'string' && whiteName.trim().toLowerCase() === normalizedTarget) targetSide = 'white'
      else if (typeof blackName === 'string' && blackName.trim().toLowerCase() === normalizedTarget) targetSide = 'black'
      else targetSide = null
      
      const sideDuration = performance.now() - sideStartTime
      if (sideDuration > 10) {
        log('Slow side determination', { sideDuration, gameId: (game as any)?.id })
      }
    }
    
    const judgmentStartTime = performance.now()
    analyzedMoves.forEach((mv: any, idx: number) => {
      const judgment = mv?.judgment?.name as string | undefined
      const centipawnLoss = mv?.judgment?.cp as number | undefined
      if (!judgment) return
      const plyValue: number = typeof mv?.ply === 'number' ? mv.ply : idx + 1
      const moveNumber = Math.ceil(plyValue / 2)
      
      // If filtering by username, only include moves made by that side
      if (targetSide) {
        const isWhiteMove = (mv?.ply ?? idx + 1) % 2 === 1
        if ((targetSide === 'white' && !isWhiteMove) || (targetSide === 'black' && isWhiteMove)) return
      }
      
      const key = openingName
      const name = judgment.toLowerCase()
      if (name === 'inaccuracy') {
        summary.total.inaccuracies += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
      } else if (name === 'mistake') {
        summary.total.mistakes += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
      } else if (name === 'blunder') {
        summary.total.blunders += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
        summary.blundersByOpening[key] = (summary.blundersByOpening[key] ?? 0) + 1
        summary.topBlunders.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          centipawnLoss,
        })
      }
    })
    judgmentProcessingTime += performance.now() - judgmentStartTime
    
    if (!hasJudgments && analyzedMoves.length > 0) {
      const evalStartTime = performance.now()
      const evals: Array<{ cp?: number; mate?: number; ply?: number }> = analyzedMoves.map((m: any) => ({
        cp: m?.eval?.cp ?? m?.judgment?.cp,
        mate: m?.eval?.mate,
        ply: m?.ply,
      }))

      const lossForMover = (prev: any, curr: any, plyIndex: number): number => {
        if (typeof prev?.cp !== 'number' || typeof curr?.cp !== 'number') return 0
        if (typeof prev?.mate === 'number' || typeof curr?.mate === 'number') return 0
        const isWhiteMove = (plyIndex % 2) === 1
        const deltaWhite = (curr.cp as number) - (prev.cp as number)
        return isWhiteMove ? Math.max(0, -deltaWhite) : Math.max(0, deltaWhite)
      }

      for (let i = 1; i < evals.length; i++) {
        const prev = evals[i - 1]
        const curr = evals[i]
        const plyValue: number = typeof analyzedMoves[i]?.ply === 'number' ? analyzedMoves[i].ply : i + 1
        const moveNumber = Math.ceil(plyValue / 2)
        if (targetSide) {
          const isWhiteMove = (analyzedMoves[i]?.ply ?? i + 1) % 2 === 1
          if ((targetSide === 'white' && !isWhiteMove) || (targetSide === 'black' && isWhiteMove)) continue
        }
        const delta = lossForMover(prev, curr, plyValue)
        if (delta >= 250) {
          summary.total.blunders += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.blundersByOpening[openingName] = (summary.blundersByOpening[openingName] ?? 0) + 1
          summary.topBlunders.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            centipawnLoss: delta,
          })
        } else if (delta >= 150) {
          summary.total.mistakes += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
        } else if (delta >= 60) {
          summary.total.inaccuracies += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
        }
      }
      moveProcessingTime += performance.now() - evalStartTime
    }
    
    gameAnalysisTime += performance.now() - gameStartTime
    
    // Log slow games
    const gameDuration = performance.now() - gameStartTime
    if (gameDuration > 50) {
      log('Slow game analysis', { 
        gameDuration, 
        gameId: (game as any)?.id, 
        moveCount: analyzedMoves.length,
        hasJudgments 
      })
    }
  }
  
  log('Game analysis completed', { 
    gameAnalysisTime, 
    judgmentProcessingTime, 
    moveProcessingTime,
    totalBlunders: summary.topBlunders.length 
  })
  
  const sortStartTime = performance.now()
  summary.topBlunders.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  const sortDuration = performance.now() - sortStartTime
  log('Sorting completed', { sortDuration, blunderCount: summary.topBlunders.length })
  
  // Show that we're now preparing the UI
  postMessage({ type: 'progress', current: total, total, phase: 'Preparing results' })
  
  const totalDuration = performance.now() - totalStartTime
  log('Analysis completed', { 
    totalDuration, 
    gameCount: games.length,
    blunders: summary.total.blunders,
    mistakes: summary.total.mistakes,
    inaccuracies: summary.total.inaccuracies
  })
  
  return summary
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  if (event.data.type === 'analyze') {
    try {
      log('Worker received analyze request', { gameCount: event.data.games.length })
      const summary = await analyzeGamesWithProgress(
        event.data.games, 
        event.data.options,
        (message) => self.postMessage(message)
      )
      self.postMessage({ type: 'result', summary })
    } catch (error) {
      log('Worker error', { error: error instanceof Error ? error.message : 'Unknown error' })
      self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
}
