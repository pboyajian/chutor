import React, { useMemo, useState } from 'react'
import type { AnalysisSummary } from '../lib/analysis'
import type { LichessGame } from '../lib/lichess'
import { Chess } from 'chess.js'

export interface MistakeItemMeta {
  gameId: string
  moveNumber: number
  centipawnLoss?: number
  ply?: number
  side?: 'white' | 'black'
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
  // Precompute per-game move list and FENs after each ply for fast lookup
  const gameIndex = useMemo(() => {
    const map = new Map<
      string,
      {
        verbose: Array<{ san: string; from: string; to: string; promotion?: string }>
        fensAfterPly: string[]
      }
    >()
    const extractHeader = (tag: string, text?: string): string | undefined => {
      if (!text) return undefined
      const m = new RegExp(`\\[${tag}\\s+"([^"]+)"\\]`).exec(text)
      return m?.[1]
    }
    for (const g of games as any[]) {
      const id = String(g?.id ?? '')
      if (!id) continue
      const pgnRaw: string | undefined = (g?.pgn?.raw as string) ?? (typeof g?.pgn === 'string' ? g.pgn : undefined)
      const initialFen: string | undefined = g?.initialFen || extractHeader('FEN', pgnRaw)
      const tmp = new Chess(initialFen)
      if (pgnRaw) tmp.loadPgn(pgnRaw)
      const verbose = tmp.history({ verbose: true }) as Array<{ san: string; from: string; to: string; promotion?: string }>
      // Build FEN after each ply in one forward pass
      const engine = new Chess(initialFen)
      const fensAfterPly: string[] = []
      for (const mv of verbose) {
        engine.move({ from: mv.from, to: mv.to, promotion: mv.promotion })
        fensAfterPly.push(engine.fen())
      }
      map.set(id, { verbose, fensAfterPly })
    }
    return map
  }, [games])
  const [sortMode, setSortMode] = useState<'recurrence' | 'move'>('recurrence')
  const [page, setPage] = useState(1)
  const pageSize = 20
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

    const getFenFor = (game: any, moveNumber: number): string => {
      const gid = String(game?.id ?? '')
      const data = gameIndex.get(gid)
      const targetPly = Math.max(1, moveNumber * 2 - 1)
      const fen = data?.fensAfterPly?.[targetPly - 1]
      return fen || new Chess().fen()
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
    const computePlayedSan = (game: any, moveNumber: number): string | undefined => {
      try {
        const gid = String(game?.id ?? '')
        const data = gameIndex.get(gid)
        const verbose = data?.verbose ?? []
        const plyIndex = Math.max(0, Math.min(verbose.length - 1, moveNumber * 2 - 2))
        return verbose[plyIndex]?.san
      } catch {
        return undefined
      }
    }

    const extractBestMoveSan = (game: any, moveNumber: number): string | undefined => {
      try {
        const analyzed = Array.isArray(game?.analysis) ? (game.analysis as any[]) : []
        const isWhiteMove = (moveNumber * 2 - 1) % 2 === 1
        const targetPly = isWhiteMove ? moveNumber * 2 - 1 : moveNumber * 2
        const mv = analyzed.find((m) => typeof m?.ply === 'number' && m.ply === targetPly)
        if (!mv) return undefined
        // If UCI best move available
        const uci: string | undefined = (mv?.best as string) || (mv?.uciBest as string) || undefined
        if (uci && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
          // Build position before the move
          const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
          const engine = new Chess()
          if (pgnRaw) engine.loadPgn(pgnRaw)
          const verbose = engine.history({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>
          // Rebuild up to previous ply
          const prev = new Chess()
          if (pgnRaw) {
            let count = 0
            for (const m of verbose) {
              if (count >= targetPly - 1) break
              prev.move({ from: m.from, to: m.to, promotion: m.promotion })
              count += 1
            }
          }
          const move = {
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
          }
          const res = prev.move(move as any)
          if (res && typeof (res as any).san === 'string') return (res as any).san as string
        }

        const comment: string | undefined = (mv?.judgment?.comment as string | undefined) || (mv?.comment as string | undefined)
        if (comment) {
          // Try to find a legal SAN token in the comment on the position before the move
          const pgnRaw: string | undefined = (game?.pgn?.raw as string) ?? (typeof game?.pgn === 'string' ? game.pgn : undefined)
          const engine = new Chess()
          if (pgnRaw) {
            // Play up to previous ply
            const tmp = new Chess()
            tmp.loadPgn(pgnRaw)
            const verbose = tmp.history({ verbose: true }) as Array<{ from: string; to: string; promotion?: string }>
            const prev = new Chess()
            let count = 0
            for (const m of verbose) {
              if (count >= targetPly - 1) break
              prev.move({ from: m.from, to: m.to, promotion: m.promotion })
              count += 1
            }
            // Extract SAN-like tokens and test legality
            const sanCandidates = (comment.match(/(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)/g) || [])
            for (const cand of sanCandidates) {
              try {
                const res = prev.move(cand)
                if (res) return (res as any).san as string
              } catch {
                // ignore
              }
            }
          }
        }
      } catch {
        // ignore
      }
      return undefined
    }
    // attach group frequency for sorting: by position signature, ignoring type/move order
    const withMeta = summary.topBlunders
      .filter((b) => b.gameId && map[b.gameId])
      .map((b) => {
        const game: any = map[b.gameId]
        const fen = (() => {
          const gid = String(game?.id ?? '')
          const data = gameIndex.get(gid)
          const targetPly = Math.max(1, b.moveNumber * 2 - 1)
          return data?.fensAfterPly?.[targetPly - 1] || new Chess().fen()
        })()
        const sig = positionSignature(fen)
        const frequency = signatureCounts[sig] ?? 1
        const playedSan = computePlayedSan(game, b.moveNumber)
        const bestSan = extractBestMoveSan(game, b.moveNumber)
        return { ...b, game, frequency, playedSan, bestSan }
      }) as Array<MistakeItemMeta & { game: any; frequency: number; playedSan?: string; bestSan?: string }>

    if (sortMode === 'move') {
      return withMeta.sort((a, b) => a.moveNumber - b.moveNumber)
    }
    return withMeta.sort((a, b) => b.frequency - a.frequency)
  }, [games, summary.topBlunders, signatureCounts, sortMode])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page])

  function computeFenAtMove(_game: any, _moveNumber: number): string {
    // Replaced by gameIndex-based fast path above
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

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-md font-semibold text-gray-100">Top blunders</h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-300" htmlFor="blunder-sort">Sort:</label>
          <select
            id="blunder-sort"
            className="px-2 py-1 border border-slate-700 rounded text-xs bg-slate-800/60 text-gray-200"
            value={sortMode}
            onChange={(e) => {
              setSortMode(e.target.value as 'recurrence' | 'move')
              setPage(1)
            }}
          >
            <option value="recurrence">By recurrence</option>
            <option value="move">By move number (earlier first)</option>
          </select>
        </div>
      </div>
      {items.length === 0 && <p className="text-sm text-gray-400">No blunders identified.</p>}
      <ul role="list" className="divide-y divide-slate-700 text-left">
        {pagedItems.map((item) => {
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
                  <div className="text-xs text-gray-400 mt-0.5">
                    <span className="text-gray-300">Played:</span> {item.playedSan ?? '—'}
                    {item.bestSan && (
                      <>
                        <span className="mx-2">•</span>
                        <span className="text-gray-300">Best:</span> {item.bestSan}
                      </>
                    )}
                  </div>
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
      {items.length > pageSize && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-slate-700 text-gray-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <div className="text-xs text-gray-400">
            Page {page} / {Math.ceil(items.length / pageSize)}
          </div>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-slate-700 text-gray-200 disabled:opacity-50"
            onClick={() => setPage((p) => (p * pageSize < items.length ? p + 1 : p))}
            disabled={page * pageSize >= items.length}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

