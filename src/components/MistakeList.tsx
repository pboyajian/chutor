import React, { useMemo } from 'react'
import type { AnalysisSummary } from '../lib/analysis'
import type { LichessGame } from '../lib/lichess'
import { Chess } from 'chess.js'

export interface MistakeItemMeta {
  gameId: string
  moveNumber: number
  centipawnLoss?: number
}

export default function MistakeList({
  games,
  summary,
  onSelect,
  selected,
}: {
  games: LichessGame[]
  summary: AnalysisSummary
  onSelect: (fen: string, meta: MistakeItemMeta) => void
  selected?: MistakeItemMeta | null
}) {
  function positionSignature(fen: string): string {
    const parts = fen.split(' ')
    // Use piece placement + active color. Ignore castling rights, en passant, clocks.
    return `${parts[0]} ${parts[1]}`
  }

  // Group recurring patterns by normalized position signature across all mistake types
  const { recurringPatterns, signatureCounts } = useMemo(() => {
    const counts: Record<string, number> = {}
    const openingCounts: Record<string, Record<string, number>> = {}
    const samples: Record<string, { gameId: string; moveNumber: number }> = {}

    const fenCache = new Map<string, string>()
    const getFenFor = (game: any, moveNumber: number): string => {
      const gid = String(game?.id ?? '')
      const key = `${gid}#${moveNumber}`
      const cached = fenCache.get(key)
      if (cached) return cached
      const fen = computeFenAtMove(game, moveNumber)
      fenCache.set(key, fen)
      return fen
    }

    for (const g of games as any[]) {
      const opening = String(g?.opening?.name ?? 'Unknown')
      const gameId = String(g?.id ?? '')
      const analyzed = Array.isArray(g?.analysis) ? (g.analysis as any[]) : []
      for (const mv of analyzed) {
        const name: string | undefined = mv?.judgment?.name
        const ply: number | undefined = mv?.ply
        if (!name || typeof ply !== 'number') continue
        const moveNumber = Math.ceil(ply / 2)
        const fen = getFenFor(g, moveNumber)
        const sig = positionSignature(fen)
        counts[sig] = (counts[sig] ?? 0) + 1
        if (!openingCounts[sig]) openingCounts[sig] = {}
        openingCounts[sig][opening] = (openingCounts[sig][opening] ?? 0) + 1
        if (!samples[sig]) samples[sig] = { gameId, moveNumber }
      }
    }

    const recurring = Object.keys(counts)
      .map((sig) => {
        const openings = openingCounts[sig] ?? {}
        const topOpening = Object.entries(openings).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Various'
        return {
          signature: sig,
          opening: topOpening,
          count: counts[sig],
          sample: samples[sig],
        }
      })
      .sort((a, b) => b.count - a.count)

    return { recurringPatterns: recurring, signatureCounts: counts }
  }, [games])

  const items = useMemo(() => {
    const map: Record<string, LichessGame> = {}
    for (const g of games) {
      const id = String((g as any)?.id ?? '')
      if (id) map[id] = g
    }
    // attach group frequency for sorting: by position signature, ignoring type/move order
    const withMeta = summary.topBlunders
      .filter((b) => b.gameId && map[b.gameId])
      .map((b) => {
        const game: any = map[b.gameId]
        const fen = computeFenAtMove(game, b.moveNumber)
        const sig = positionSignature(fen)
        const frequency = signatureCounts[sig] ?? 1
        return { ...b, game, frequency }
      }) as Array<MistakeItemMeta & { game: any; frequency: number }>

    return withMeta.sort((a, b) => b.frequency - a.frequency)
  }, [games, summary.topBlunders, signatureCounts])

  function computeFenAtMove(game: any, moveNumber: number): string {
    try {
      // Prefer PGN if available
      const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
      if (pgnRaw) {
        // Build move list from PGN, then play up to target ply
        const tmp = new Chess()
        tmp.loadPgn(pgnRaw)
        const verboseMoves = tmp.history({ verbose: true }) as Array<{
          from: string
          to: string
          promotion?: string
        }>
        const targetPly = Math.max(0, Math.min(verboseMoves.length, moveNumber * 2 - 1))
        const engine = new Chess()
        for (let i = 0; i < targetPly; i += 1) {
          const m = verboseMoves[i]
          if (!m) break
          engine.move({ from: m.from, to: m.to, promotion: m.promotion })
        }
        return engine.fen()
      }

      // Fallback: use moves SAN string if provided by API
      const movesStr: string | undefined = game?.moves
      if (typeof movesStr === 'string' && movesStr.trim()) {
        const initialFen: string | undefined = game?.initialFen
        const engine = new Chess(initialFen)
        const sanTokens = movesStr.trim().split(/\s+/)
        const targetPly = Math.max(0, Math.min(sanTokens.length, moveNumber * 2 - 1))
        let plyCount = 0
        for (const tok of sanTokens) {
          if (/^\d+\.|^\d+\.\.\./.test(tok)) continue
          if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break
          try {
            engine.move(tok)
          } catch {
            break
          }
          plyCount += 1
          if (plyCount >= targetPly) break
        }
        return engine.fen()
      }
    } catch (_) {
      // noop
    }
    // Ultimate fallback: starting position
    return new Chess().fen()
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 shadow-sm animate-fade-in-up">
      <h2 className="mb-3 text-lg font-semibold text-gray-100">Recurring mistakes by position</h2>
      {recurringPatterns.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">No recurring mistakes found.</p>
      ) : (
        <ul className="mb-4 space-y-1">
          {recurringPatterns.slice(0, 10).map((p) => {
            const sampleGameId = p.sample?.gameId
            return (
              <li key={`${p.signature}`}>
                <button
                  type="button"
                  className="text-left w-full px-2 py-1 rounded-md hover:bg-slate-700/60 transition flex items-center justify-between gap-3 text-gray-200"
                  onClick={() => {
                    const game: any = (games as any[]).find((g) => String((g as any)?.id ?? '') === sampleGameId)
                    if (!game) return
                    const moveNumber = p.sample?.moveNumber ?? 1
                    const fen = computeFenAtMove(game, moveNumber)
                    onSelect(fen, { gameId: sampleGameId ?? '', moveNumber })
                  }}
                >
                  <span className="truncate mr-2">
                    <span className="font-medium text-gray-100">{p.opening}</span> — Common position
                  </span>
                  <span className="text-sm tabular-nums bg-slate-700 text-gray-200 px-2 py-0.5 rounded-md">×{p.count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h3 className="mb-2 text-md font-semibold text-gray-100">Top blunders (sorted by recurrence)</h3>
      {items.length === 0 && <p className="text-sm text-gray-400">No blunders identified.</p>}
      <ul role="list" className="divide-y divide-slate-700 text-left">
        {items.map((item) => {
          const opening = String((item.game?.opening?.name as string) ?? 'Unknown')
          const isSelected = selected?.gameId === item.gameId && selected?.moveNumber === item.moveNumber
          return (
            <li key={`${item.gameId}-${item.moveNumber}`} className={`py-2 ${isSelected ? 'bg-blue-950/40' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  const fen = computeFenAtMove(item.game, item.moveNumber)
                  onSelect(fen, { gameId: item.gameId, moveNumber: item.moveNumber, centipawnLoss: item.centipawnLoss })
                }}
                className="w-full text-left flex items-center justify-between gap-3 px-2 hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-blue-500/60 rounded-md transition text-gray-200"
              >
                <div>
                  <div className="font-medium text-gray-100">Move {item.moveNumber}</div>
                  <div className="text-sm text-gray-400 truncate max-w-[32ch]">{opening}</div>
                </div>
                <div className="text-right">
                  {typeof item.centipawnLoss === 'number' && (
                    <div className="text-sm tabular-nums text-gray-300">Δcp: {item.centipawnLoss}</div>
                  )}
                  <div className="text-xs text-gray-400">×{item.frequency}</div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

