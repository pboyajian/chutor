import type { LichessGame } from './lichess'

export interface AnalysisSummary {
  total: {
    inaccuracies: number
    mistakes: number
    blunders: number
  }
  mistakesByOpening: Record<string, number>
  blundersByOpening: Record<string, number>
  topBlunders: Array<{ gameId: string; moveNumber: number; ply: number; side: 'white' | 'black'; centipawnLoss?: number }>
  topMistakes: Array<{
    gameId: string
    moveNumber: number
    ply: number
    side: 'white' | 'black'
    centipawnLoss?: number
    kind: 'inaccuracy' | 'mistake' | 'blunder'
    bootstrapped?: boolean
  }>
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
    topMistakes: [],
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
        summary.topMistakes.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          centipawnLoss,
          kind: 'inaccuracy',
        })
      } else if (name === 'mistake') {
        summary.total.mistakes += 1
        summary.mistakesByOpening[key] = (summary.mistakesByOpening[key] ?? 0) + 1
        summary.topMistakes.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          centipawnLoss,
          kind: 'mistake',
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
          centipawnLoss,
        })
        summary.topMistakes.push({
          gameId: String((game as any)?.id ?? ''),
          moveNumber,
          ply: plyValue,
          side: plyValue % 2 === 1 ? 'white' : 'black',
          centipawnLoss,
          kind: 'blunder',
        })
      }
    })

    if (!hasJudgments && analyzedMoves.length > 0) {
      const evals: Array<{ cp?: number; mate?: number; ply?: number }> = analyzedMoves.map((m: any) => ({
        cp: m?.eval?.cp ?? m?.judgment?.cp,
        mate: m?.eval?.mate,
        ply: m?.ply,
      }))

      // Mover-centric centipawn loss: compare eval after move (i)
      // versus eval before move (i-1), normalized to the mover's perspective.
      const lossForMover = (prev: any, curr: any, plyIndex: number): number => {
        // Skip if mate scores are involved
        if (typeof prev?.cp !== 'number' || typeof curr?.cp !== 'number') return 0
        if (typeof prev?.mate === 'number' || typeof curr?.mate === 'number') return 0
        const isWhiteMove = (plyIndex % 2) === 1 // 1-based ply: odd=white, even=black
        const prevWhite = prev.cp
        const currWhite = curr.cp
        const deltaWhite = currWhite - prevWhite
        // For white, loss is a drop in white eval; for black, loss is a drop in black eval = increase in white eval
        const loss = isWhiteMove ? Math.max(0, -deltaWhite) : Math.max(0, deltaWhite)
        return loss
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
          summary.topMistakes.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            centipawnLoss: delta,
            kind: 'blunder',
          })
        } else if (delta >= 150) {
          summary.total.mistakes += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.topMistakes.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            centipawnLoss: delta,
            kind: 'mistake',
          })
        } else if (delta >= 60) {
          summary.total.inaccuracies += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.topMistakes.push({
            gameId: String((game as any)?.id ?? ''),
            moveNumber,
            ply: plyValue,
            side: plyValue % 2 === 1 ? 'white' : 'black',
            centipawnLoss: delta,
            kind: 'inaccuracy',
          })
        }
      }
    }
  }

  summary.topBlunders.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  summary.topMistakes.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  // Do not slice; allow pagination at the UI level
  return summary
}

export default analyzeGames


