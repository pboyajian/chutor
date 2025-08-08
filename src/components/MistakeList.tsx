import React, { useMemo, useState, useEffect, useRef } from 'react'
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
  const [sortMode, setSortMode] = useState<'recurrence' | 'move'>('recurrence')
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Worker state
  const workerRef = useRef<Worker | null>(null)
  const [isPreparing, setIsPreparing] = useState(false)
  const [preparedItems, setPreparedItems] = useState<Array<any>>([])
  const [recurringPatterns, setRecurringPatterns] = useState<Array<any>>([])

  // Kick off worker when inputs change
  useEffect(() => {
    if (!summary?.topBlunders?.length || !games?.length) {
      setPreparedItems([])
      setRecurringPatterns([])
      return
    }
    setIsPreparing(true)
    setPreparedItems([])
    setRecurringPatterns([])

    // Terminate any existing worker
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }

    const w = new Worker(new URL('../workers/mistakeDetails.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w

    w.onmessage = (evt: MessageEvent) => {
      const { type, data } = evt.data || {}
      if (type === 'progress') {
        // optional: could surface progress later
        return
      }
      if (type === 'result') {
        setPreparedItems(data.items || [])
        setRecurringPatterns(data.recurringPatterns || [])
        setIsPreparing(false)
        w.terminate()
        workerRef.current = null
      }
    }

    const payload = {
      games,
      blunders: summary.topBlunders.map((b) => ({ gameId: b.gameId, moveNumber: b.moveNumber, ply: b.ply, centipawnLoss: b.centipawnLoss })),
    }
    w.postMessage(payload)

    return () => {
      try {
        w.terminate()
      } catch {}
      workerRef.current = null
    }
  }, [games, summary])

  const items = useMemo(() => {
    const base = preparedItems.map((it) => ({
      gameId: it.gameId,
      moveNumber: it.moveNumber,
      centipawnLoss: it.centipawnLoss,
      playedSan: it.playedSan as string | undefined,
      bestSan: it.bestSan as string | undefined,
      opening: String(it.opening ?? 'Unknown'),
      fen: it.fen as string,
      game: (games as any[]).find((g) => String((g as any)?.id ?? '') === String(it.gameId)),
      frequency: 1,
    }))

    if (sortMode === 'move') return base.sort((a, b) => a.moveNumber - b.moveNumber)
    return base.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
  }, [preparedItems, sortMode, games])

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page])

  function computeFenAtMoveFromPrepared(item: any): string {
    return item.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  }

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 shadow-sm animate-fade-in-up">
      <h2 className="mb-3 text-lg font-semibold text-gray-100">Recurring mistakes by opening and move</h2>
      {isPreparing ? (
        <p className="text-sm text-gray-400 mb-3">Preparing blunder details…</p>
      ) : recurringPatterns.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">No recurring mistakes found.</p>
      ) : (
        <ul className="mb-4 space-y-1">
          {recurringPatterns.slice(0, 10).map((p) => (
            <li key={`${p.key}`}>
              <button
                type="button"
                className="text-left w-full px-2 py-1 rounded-md hover:bg-slate-700/60 transition flex items-center justify-between gap-3 text-gray-200"
                onClick={() => {
                  const item = preparedItems.find((i) => i.gameId === p.sample?.gameId && i.moveNumber === p.sample?.moveNumber)
                  if (!item) return
                  onSelect(computeFenAtMoveFromPrepared(item), { gameId: item.gameId, moveNumber: item.moveNumber })
                }}
              >
                <span className="truncate mr-2">
                  <span className="font-medium text-gray-100">{p.opening}</span> — {p.move}
                </span>
                <span className="text-sm tabular-nums bg-slate-700 text-gray-200 px-2 py-0.5 rounded-md">×{p.count}</span>
              </button>
            </li>
          ))}
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
      {isPreparing && <p className="text-sm text-gray-400">Preparing blunders…</p>}
      {!isPreparing && items.length === 0 && <p className="text-sm text-gray-400">No blunders identified.</p>}
      <ul role="list" className="divide-y divide-slate-700 text-left">
        {pagedItems.map((item) => {
          const opening = String((item.game as any)?.opening?.name ?? item.opening ?? 'Unknown')
          const isSelected = selected?.gameId === item.gameId && selected?.moveNumber === item.moveNumber
          return (
            <li key={`${item.gameId}-${item.moveNumber}`} className={`py-2 ${isSelected ? 'bg-blue-950/40' : ''}`}>
              <button
                type="button"
                onClick={() => {
                  const fen = computeFenAtMoveFromPrepared(item)
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
      {!isPreparing && items.length > pageSize && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-slate-700 text-gray-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </button>
          <span className="text-xs text-gray-400">
            Page {page} of {Math.ceil(items.length / pageSize)}
          </span>
          <button
            type="button"
            className="px-2 py-1 text-xs rounded border border-slate-700 text-gray-200 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(Math.ceil(items.length / pageSize), p + 1))}
            disabled={page >= Math.ceil(items.length / pageSize)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

