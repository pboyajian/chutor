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
  
  const result: { white?: string; black?: string } = {}
  if (white) result.white = white
  if (black) result.black = black
  return result
}

function deriveUsernameFromGames(all: any[]): string | undefined {
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
  return best
}

// Compute verbose moves for a single game
function computeVerboseMoves(game: any): Array<{ san: string; from: string; to: string; promotion?: string }> {
  try {
    const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
    if (!pgnRaw) return []
    
    const Chess = require('chess.js').Chess
    const engine = new Chess()
    engine.loadPgn(pgnRaw)
    return engine.history({ verbose: true }) as Array<{ san: string; from: string; to: string; promotion?: string }>
  } catch (error) {
    console.warn('Failed to parse game moves:', game?.id, error)
    return []
  }
}

// Compute positions for a single game
function computePositions(game: any): Map<number, string> {
  try {
    const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
    if (!pgnRaw) return new Map()
    
    const Chess = require('chess.js').Chess
    const engine = new Chess()
    engine.loadPgn(pgnRaw)
    const verbose = engine.history({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>
    
    const positions = new Map<number, string>()
    positions.set(0, engine.fen()) // Starting position
    
    // Build positions incrementally
    const temp = new Chess()
    for (let i = 0; i < verbose.length; i++) {
      const move = verbose[i]
      temp.move({ from: move.from, to: move.to, promotion: move.promotion })
      positions.set(i + 1, temp.fen())
    }
    
    return positions
  } catch (error) {
    console.warn('Failed to compute positions for game:', game?.id, error)
    return new Map()
  }
}

// Compute recurring patterns from blunders
function computeRecurringPatterns(games: any[], topBlunders: any[], verboseMovesByGame: Map<string, any[]>): any[] {
  const counts: Record<string, number> = {}
  const samples: Record<string, { gameId: string; moveNumber: number; opening: string; move: string }> = {}
  const gameMap: Record<string, any> = {}
  
  for (const g of games as any[]) {
    const id = String(g?.id ?? '')
    if (id) gameMap[id] = g
  }
  
  for (const b of topBlunders) {
    const game: any = gameMap[b.gameId]
    if (!game) continue
    const opening = String(game?.opening?.name ?? 'Unknown')
    const gid = String(game?.id ?? '')
    const verbose = verboseMovesByGame.get(gid) ?? []
    const plyIndex = Math.max(0, Math.min(verbose.length - 1, b.moveNumber * 2 - 2))
    const san = verbose[plyIndex]?.san ?? '—'
    const key = `${opening}||${san}`
    counts[key] = (counts[key] ?? 0) + 1
    if (!samples[key]) {
      samples[key] = { gameId: gid, moveNumber: b.moveNumber, opening, move: san }
    }
  }
  
  return Object.entries(counts)
    .map(([key, count]) => {
      const [opening, move] = key.split('||')
      return {
        key,
        opening,
        move,
        count,
        sample: samples[key]
      }
    })
    .sort((a, b) => b.count - a.count)
}

// Enhanced analysis with precomputed data
function analyzeGamesWithPrecomputedData(
  games: any[],
  options: { onlyForUsername?: string } = {},
): any {
  console.log('🎮 Starting enhanced analysis with precomputed data...')
  
  const summary: any = {
    total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
    mistakesByOpening: {},
    blundersByOpening: {},
    topBlunders: [],
    topMistakes: [],
    verboseMovesByGame: new Map(),
    positionsByGame: new Map(),
    recurringPatterns: []
  }

  const normalizedTarget = options.onlyForUsername?.trim().toLowerCase() || ''
  const totalGames = games.length
  let processedGames = 0
  const logInterval = Math.max(1, Math.floor(totalGames / 10))

  // First pass: analyze moves and collect blunders
  for (const game of games) {
    processedGames++
    
    if (processedGames % logInterval === 0 || processedGames === totalGames) {
      const progress = ((processedGames / totalGames) * 100).toFixed(1)
      console.log(`📈 Analysis progress: ${processedGames}/${totalGames} games (${progress}%)`)
    }
    
    const openingName = String((game as any)?.opening?.name ?? 'Unknown')
    const analyzedMoves: any[] = Array.isArray((game as any)?.analysis)
      ? ((game as any).analysis as any[])
      : []

    const hasJudgments = analyzedMoves.some((mv) => mv?.judgment?.name)

    // Determine which side (white/black) the target username is playing in this game, if provided
    let targetSide: 'white' | 'black' | null = null
    if (normalizedTarget) {
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
    }

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
        summary.topMistakes.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          ...(centipawnLoss !== undefined && { centipawnLoss }),
          kind: 'inaccuracy'
        })
      } else if (name === 'mistake') {
        summary.total.mistakes += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
        summary.topMistakes.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          ...(centipawnLoss !== undefined && { centipawnLoss }),
          kind: 'mistake'
        })
      } else if (name === 'blunder') {
        summary.total.blunders += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
        summary.blundersByOpening[key] = (summary.blundersByOpening[key] ?? 0) + 1
        summary.topBlunders.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          ...(centipawnLoss !== undefined && { centipawnLoss })
        })
        summary.topMistakes.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          ...(centipawnLoss !== undefined && { centipawnLoss }),
          kind: 'blunder'
        })
      }
    })

    if (!hasJudgments && analyzedMoves.length > 0) {
      const evals: Array<{ cp?: number; mate?: number; ply?: number }> = analyzedMoves.map((m: any) => ({
        cp: m?.eval?.cp ?? m?.judgment?.cp,
        mate: m?.eval?.mate,
        ply: m?.ply,
      }))

      const lossForMover = (prev: any, curr: any, plyIndex: number): number => {
        if (typeof prev?.cp !== 'number' || typeof curr?.cp !== 'number') return 0
        if (typeof prev?.mate === 'number' || typeof curr?.mate === 'number') return 0
        const isWhiteMove = (plyIndex % 2) === 1
        const prevWhite = prev.cp
        const currWhite = curr.cp
        const deltaWhite = currWhite - prevWhite
        const loss = isWhiteMove ? Math.max(0, -deltaWhite) : Math.max(0, deltaWhite)
        return loss
      }

      for (let i = 1; i < evals.length; i++) {
        const prev = evals[i - 1]
        const curr = evals[i]
        if (!prev || !curr) continue
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
            ...(delta > 0 && { centipawnLoss: delta })
          })
          summary.topMistakes.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            ...(delta > 0 && { centipawnLoss: delta }),
            kind: 'blunder'
          })
        } else if (delta >= 150) {
          summary.total.mistakes += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.topMistakes.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            ...(delta > 0 && { centipawnLoss: delta }),
            kind: 'mistake'
          })
        } else if (delta >= 60) {
          summary.total.inaccuracies += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.topMistakes.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            ...(delta > 0 && { centipawnLoss: delta }),
            kind: 'inaccuracy'
          })
        }
      }
    }
  }

  console.log(`🎯 Basic analysis complete! Found ${summary.total.blunders} blunders, ${summary.total.mistakes} mistakes, ${summary.total.inaccuracies} inaccuracies`)
  
  // Second pass: precompute verbose moves and positions
  console.log('🔄 Starting precomputation phase...')
  processedGames = 0
  
  for (const game of games) {
    processedGames++
    
    if (processedGames % logInterval === 0 || processedGames === totalGames) {
      const progress = ((processedGames / totalGames) * 100).toFixed(1)
      console.log(`📈 Precomputation progress: ${processedGames}/${totalGames} games (${progress}%)`)
    }
    
    const gameId = String(game?.id ?? '')
    if (!gameId) continue
    
    // Compute verbose moves
    const verboseMoves = computeVerboseMoves(game)
    summary.verboseMovesByGame.set(gameId, verboseMoves)
    
    // Compute positions
    const positions = computePositions(game)
    summary.positionsByGame.set(gameId, positions)
  }
  
  console.log('✅ Precomputation complete!')
  
  // Third pass: compute recurring patterns
  console.log('🔄 Computing recurring patterns...')
  summary.recurringPatterns = computeRecurringPatterns(games, summary.topBlunders, summary.verboseMovesByGame)
  console.log(`✅ Recurring patterns complete! Found ${summary.recurringPatterns.length} patterns`)
  
  summary.topBlunders.sort((a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  summary.topMistakes.sort((a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  
  // Convert Maps to objects for JSON serialization
  const verboseMovesObj: Record<string, any[]> = {}
  const positionsObj: Record<string, Record<number, string>> = {}
  
  for (const [gameId, moves] of summary.verboseMovesByGame.entries()) {
    verboseMovesObj[gameId] = moves
  }
  
  for (const [gameId, positions] of summary.positionsByGame.entries()) {
    const posObj: Record<number, string> = {}
    for (const [ply, fen] of positions.entries()) {
      posObj[ply] = fen
    }
    positionsObj[gameId] = posObj
  }
  
  return {
    ...summary,
    verboseMovesByGame: verboseMovesObj,
    positionsByGame: positionsObj
  }
}

function analyzeGames(
  games: any[],
  options: { onlyForUsername?: string } = {},
): any {
  const summary: any = {
    total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
    mistakesByOpening: {},
    blundersByOpening: {},
    topBlunders: [],
    topMistakes: [],
  }

  const normalizedTarget = options.onlyForUsername?.trim().toLowerCase() || ''
  const totalGames = games.length
  let processedGames = 0
  const logInterval = Math.max(1, Math.floor(totalGames / 10))

  console.log(`🎮 Starting analysis of ${totalGames} games...`)
  const restrictOpening: string | undefined = (options as any)?.bootstrapOpening

  // Maps and collections for bootstrapping
  const openingByGame: Map<string, string> = new Map()
  const positionsByGame: Map<string, Map<number, string>> = new Map()
  type RawLabel = { gameId: string; moveNumber: number; ply: number; side: 'white' | 'black'; kind: 'inaccuracy' | 'mistake' | 'blunder'; cp?: number; opening: string }
  const rawLabels: RawLabel[] = []

  for (const game of games) {
    processedGames++
    
    if (processedGames % logInterval === 0 || processedGames === totalGames) {
      const progress = ((processedGames / totalGames) * 100).toFixed(1)
      console.log(`📈 Progress: ${processedGames}/${totalGames} games (${progress}%)`)
    }
    
    const openingName = String((game as any)?.opening?.name ?? 'Unknown')
    const gid = String((game as any)?.id ?? '')
    if (gid) openingByGame.set(gid, openingName)
    const analyzedMoves: any[] = Array.isArray((game as any)?.analysis)
      ? ((game as any).analysis as any[])
      : []

    const hasJudgments = analyzedMoves.some((mv) => mv?.judgment?.name)

    // Determine which side (white/black) the target username is playing in this game, if provided
    let targetSide: 'white' | 'black' | null = null
    if (normalizedTarget) {
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
    }

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
        rawLabels.push({ gameId: String((game as any)?.id ?? ''), moveNumber, ply: plyValue, side: plyValue % 2 === 1 ? 'white' : 'black', kind: 'inaccuracy', cp: typeof centipawnLoss === 'number' ? centipawnLoss : undefined, opening: key })
      } else if (name === 'mistake') {
        summary.total.mistakes += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
        rawLabels.push({ gameId: String((game as any)?.id ?? ''), moveNumber, ply: plyValue, side: plyValue % 2 === 1 ? 'white' : 'black', kind: 'mistake', cp: typeof centipawnLoss === 'number' ? centipawnLoss : undefined, opening: key })
      } else if (name === 'blunder') {
        summary.total.blunders += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
        summary.blundersByOpening[key] = (summary.blundersByOpening[key] ?? 0) + 1
        summary.topBlunders.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          ...(centipawnLoss !== undefined && { centipawnLoss })
        })
        rawLabels.push({ gameId: String((game as any)?.id ?? ''), moveNumber, ply: plyValue, side: plyValue % 2 === 1 ? 'white' : 'black', kind: 'blunder', cp: typeof centipawnLoss === 'number' ? centipawnLoss : undefined, opening: key })
      }
    })

    if (!hasJudgments && analyzedMoves.length > 0) {
      const evals: Array<{ cp?: number; mate?: number; ply?: number }> = analyzedMoves.map((m: any) => ({
        cp: m?.eval?.cp ?? m?.judgment?.cp,
        mate: m?.eval?.mate,
        ply: m?.ply,
      }))
      for (let i = 1; i < evals.length; i++) {
        const prev = evals[i - 1]
        const curr = evals[i]
        if (!prev || !curr) continue
        
        const delta = typeof prev.cp === 'number' && typeof curr.cp === 'number' ? Math.abs(curr.cp - prev.cp) : 0
        const plyValue: number = typeof analyzedMoves[i]?.ply === 'number' ? analyzedMoves[i].ply : i + 1
        const moveNumber = Math.ceil(plyValue / 2)
        if (targetSide) {
          const isWhiteMove = (analyzedMoves[i]?.ply ?? i + 1) % 2 === 1
          if ((targetSide === 'white' && !isWhiteMove) || (targetSide === 'black' && isWhiteMove)) continue
        }
        if (delta >= 250) {
          summary.total.blunders += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.blundersByOpening[openingName] = (summary.blundersByOpening[openingName] ?? 0) + 1
          summary.topBlunders.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            ...(delta > 0 && { centipawnLoss: delta })
          })
          rawLabels.push({ gameId: String((game as any)?.id ?? ''), moveNumber, ply: plyValue, side: plyValue % 2 === 1 ? 'white' : 'black', kind: 'blunder', cp: delta > 0 ? delta : undefined, opening: openingName })
        } else if (delta >= 150) {
          summary.total.mistakes += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          rawLabels.push({ gameId: String((game as any)?.id ?? ''), moveNumber, ply: plyValue, side: plyValue % 2 === 1 ? 'white' : 'black', kind: 'mistake', cp: delta > 0 ? delta : undefined, opening: openingName })
        } else if (delta >= 60) {
          summary.total.inaccuracies += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          rawLabels.push({ gameId: String((game as any)?.id ?? ''), moveNumber, ply: plyValue, side: plyValue % 2 === 1 ? 'white' : 'black', kind: 'inaccuracy', cp: delta > 0 ? delta : undefined, opening: openingName })
        }
      }
    }
  }

  if (restrictOpening) {
    // Precompute FEN positions only for evaluated games (for index) and unevaluated games in the selected opening (for matching)
    console.log(`🔄 Precomputing FEN positions for bootstrapping (opening: ${restrictOpening})...`)
    const tPreStart = Date.now()
    const gameById: Map<string, any> = new Map()
    for (const g of games as any[]) {
      const gid2 = String(g?.id ?? '')
      if (gid2) gameById.set(gid2, g)
    }
    const evaluatedGameIds = new Set<string>()
    for (const lbl of rawLabels) evaluatedGameIds.add(lbl.gameId)
    let evaluatedPositions = 0
    for (const gid2 of evaluatedGameIds) {
      const g = gameById.get(gid2)
      if (!g) continue
      try {
        positionsByGame.set(gid2, computePositions(g))
        evaluatedPositions++
      } catch {}
    }
    let unevaluatedPositions = 0
    for (const g of games as any[]) {
      const gid2 = String(g?.id ?? '')
      if (!gid2) continue
      const opening = openingByGame.get(gid2) || 'Unknown'
      if (opening !== restrictOpening) continue
      const analyzedMoves: any[] = Array.isArray((g as any)?.analysis) ? ((g as any).analysis as any[]) : []
      const hasJudgments = analyzedMoves.some((mv) => mv?.judgment?.name)
      const hasCp = analyzedMoves.some((mv) => typeof mv?.eval?.cp === 'number')
      if (hasJudgments || hasCp) continue
      try {
        positionsByGame.set(gid2, computePositions(g))
        unevaluatedPositions++
      } catch {}
    }
    console.log(`✅ Precomputed positions: evaluated=${evaluatedPositions}, unevaluated(${restrictOpening})=${unevaluatedPositions} in ${Date.now() - tPreStart}ms`)

    // Build FEN -> aggregated label index from evaluated plies only
    console.log('🗂️  Building position-to-mistake index...')
    type Kind = 'inaccuracy' | 'mistake' | 'blunder'
    type Aggregated = { kind: Kind; moveNumber: number; ply: number; opening: string; cp?: number; frequency: number }
    const severityRank = (k: Kind) => (k === 'blunder' ? 3 : k === 'mistake' ? 2 : 1)
    const fenIndex: Map<string, Aggregated> = new Map()
    let evaluatedPliesIndexed = 0
    for (const lbl of rawLabels) {
      const pos = positionsByGame.get(lbl.gameId)
      if (!pos) continue
      const fen = pos.get(lbl.ply)
      if (!fen) continue
      evaluatedPliesIndexed++
      const existing = fenIndex.get(fen)
      if (!existing) {
        fenIndex.set(fen, { kind: lbl.kind, moveNumber: lbl.moveNumber, ply: lbl.ply, opening: lbl.opening, cp: lbl.cp, frequency: 1 })
      } else {
        existing.frequency += 1
        if (severityRank(lbl.kind) > severityRank(existing.kind)) {
          existing.kind = lbl.kind
          existing.moveNumber = lbl.moveNumber
          existing.ply = lbl.ply
          existing.opening = lbl.opening
        }
        if (typeof lbl.cp === 'number' && (typeof existing.cp !== 'number' || lbl.cp > (existing.cp ?? 0))) {
          existing.cp = lbl.cp
        }
      }
    }
    console.log(`✅ Indexed ${evaluatedPliesIndexed} evaluated plies across ${fenIndex.size} unique positions`)

    // Helper to detect whether a game already has any evaluation/judgment
    const gameIsEvaluated = (game: any): boolean => {
      const analyzedMoves: any[] = Array.isArray((game as any)?.analysis)
        ? ((game as any).analysis as any[])
        : []
      if (analyzedMoves.some((mv) => mv?.judgment?.name)) return true
      if (analyzedMoves.some((mv) => typeof mv?.eval?.cp === 'number')) return true
      return false
    }

    // Apply bootstrapped matches to unevaluated games in the selected opening
    console.log(`🔎 Applying bootstrapped matches to unevaluated games (only opening: ${restrictOpening})...`)
    const tBootStart = Date.now()
    let appliedInacc = 0
    let appliedMist = 0
    let appliedBlun = 0
    for (const game of games) {
      if (gameIsEvaluated(game)) continue
      const gid3 = String((game as any)?.id ?? '')
      if (!gid3) continue
      const opening = openingByGame.get(gid3) || 'Unknown'
      if (opening !== restrictOpening) continue
      const pos = positionsByGame.get(gid3)
      if (!pos) continue
      for (const [ply, fen] of pos.entries()) {
        if (ply === 0) continue
        const agg = fenIndex.get(fen)
        if (!agg) continue
        // Apply only when mover in this game matches mover in the indexed label (side)
        const side: 'white' | 'black' = (ply % 2) === 1 ? 'white' : 'black'
        const sameSide = side === (((agg.ply ?? ply) % 2) === 1 ? 'white' : 'black')
        if (!sameSide) continue
        const moveNumber = Math.ceil(ply / 2)
        if (agg.kind === 'blunder') {
          summary.total.blunders += 1
          summary.mistakesByOpening[opening] = (summary.mistakesByOpening[opening] ?? 0) + 1
          summary.blundersByOpening[opening] = (summary.blundersByOpening[opening] ?? 0) + 1
          appliedBlun += 1
        } else if (agg.kind === 'mistake') {
          summary.total.mistakes += 1
          summary.mistakesByOpening[opening] = (summary.mistakesByOpening[opening] ?? 0) + 1
          appliedMist += 1
        } else {
          summary.total.inaccuracies += 1
          summary.mistakesByOpening[opening] = (summary.mistakesByOpening[opening] ?? 0) + 1
          appliedInacc += 1
        }
        summary.topMistakes.push({
          gameId: gid3,
          moveNumber,
          ply,
          side,
          ...(typeof agg.cp === 'number' ? { centipawnLoss: agg.cp } : {}),
          kind: agg.kind,
          bootstrapped: true,
        })
      }
    }
    console.log(`✅ Bootstrapped applied: blunders=${appliedBlun}, mistakes=${appliedMist}, inaccuracies=${appliedInacc} in ${Date.now() - tBootStart}ms`)
  }

  console.log(`🎯 Analysis complete! Found ${summary.total.blunders} blunders, ${summary.total.mistakes} mistakes, ${summary.total.inaccuracies} inaccuracies`)
  
  summary.topBlunders.sort((a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  if (Array.isArray(summary.topMistakes)) {
    summary.topMistakes.sort((a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  }
  return summary
}

module.exports = { 
  extractGameNames, 
  deriveUsernameFromGames, 
  analyzeGames
}
