import type { LichessGame } from './lichess'

export interface AnalysisSummary {
  total: {
    inaccuracies: number
    mistakes: number
    blunders: number
  }
  mistakesByOpening: Record<string, number>
  blundersByOpening: Record<string, number>
  topBlunders: Array<{ gameId: string; moveNumber: number; centipawnLoss?: number }>
}

export function analyzeGames(games: LichessGame[]): AnalysisSummary {
  const summary: AnalysisSummary = {
    total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
    mistakesByOpening: {},
    blundersByOpening: {},
    topBlunders: [],
  }

  for (const game of games) {
    const openingName = String((game as any)?.opening?.name ?? 'Unknown')
    const analyzedMoves: any[] = Array.isArray((game as any)?.analysis)
      ? ((game as any).analysis as any[])
      : []

    const hasJudgments = analyzedMoves.some((mv) => mv?.judgment?.name)

    analyzedMoves.forEach((mv: any, idx: number) => {
      const judgment = mv?.judgment?.name as string | undefined
      const centipawnLoss = mv?.judgment?.cp as number | undefined
      if (!judgment) return
      const moveNumber = typeof mv?.ply === 'number' ? Math.ceil(mv.ply / 2) : idx + 1

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
          centipawnLoss,
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
        const delta = typeof prev.cp === 'number' && typeof curr.cp === 'number' ? Math.abs(curr.cp - prev.cp) : 0
        const moveNumber = typeof analyzedMoves[i]?.ply === 'number' ? Math.ceil(analyzedMoves[i].ply / 2) : i + 1
        if (delta >= 250) {
          summary.total.blunders += 1
          summary.mistakesByOpening[openingName] = (summary.mistakesByOpening[openingName] ?? 0) + 1
          summary.blundersByOpening[openingName] = (summary.blundersByOpening[openingName] ?? 0) + 1
          summary.topBlunders.push({ gameId: String((game as any)?.id ?? ''), moveNumber, centipawnLoss: delta })
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
  summary.topBlunders = summary.topBlunders.slice(0, 10)
  return summary
}

export default analyzeGames


