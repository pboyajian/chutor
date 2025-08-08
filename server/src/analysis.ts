import { LichessGame, AnalysisSummary } from './types'

export function extractGameNames(game: any): { white?: string; black?: string } {
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

export function deriveUsernameFromGames(all: LichessGame[]): string | undefined {
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

export function analyzeGames(
  games: LichessGame[],
  options: { onlyForUsername?: string } = {},
): AnalysisSummary {
  const summary: AnalysisSummary = {
    total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
    mistakesByOpening: {},
    blundersByOpening: {},
    topBlunders: [],
  }

  const normalizedTarget = options.onlyForUsername?.trim().toLowerCase() || ''

  for (const game of games) {
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
          ...(centipawnLoss !== undefined && { centipawnLoss })
        })
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
        } else if (delta >= 150) {
          summary.total.mistakes += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
        } else if (delta >= 60) {
          summary.total.inaccuracies += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
        }
      }
    }
  }

  summary.topBlunders.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  return summary
}
