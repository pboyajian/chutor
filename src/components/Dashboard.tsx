import React, { useMemo, useState, useEffect } from 'react'
import analyzeGames, { type AnalysisSummary } from '../lib/analysis'
import { apiClient } from '../lib/api'
import type { LichessGame } from '../lib/lichess'
import MistakeList from './MistakeList'
import ChessboardDisplay from './ChessboardDisplay'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
} from 'recharts'

const COLORS = ['#60a5fa', '#22d3ee', '#a78bfa']

type ChartView = 'pie' | 'bar'

export default function Dashboard({
  summary,
  games = [],
  filterUsername,
}: {
  summary: AnalysisSummary
  games?: LichessGame[]
  filterUsername?: string
}) {
  const [view, setView] = useState<ChartView>('pie')
  const [selectedFen, setSelectedFen] = useState<string>(
    'rn1qkbnr/pp3ppp/2p5/3pp3/8/1P2PN2/PBPP1PPP/RN1QKB1R w KQkq - 0 5',
  )
  const [copied, setCopied] = useState<boolean>(false)
  const [selectedMeta, setSelectedMeta] = useState<{ gameId: string; moveNumber: number } | null>(null)
  const [selectedOpening, setSelectedOpening] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(false)
  const [bootstrappedOpening, setBootstrappedOpening] = useState<string | null>(null)
  
  // Reset selected opening when games change
  useEffect(() => {
    setSelectedOpening(null)
  }, [games])
  // Reset bootstrap state when opening changes
  useEffect(() => {
    setIsBootstrapping(false)
    setBootstrappedOpening(null)
  }, [selectedOpening])
  const orientation: 'white' | 'black' = useMemo(() => {
    const parts = selectedFen.split(' ')
    return parts[1] === 'b' ? 'black' : 'white'
  }, [selectedFen])
  const toMoveLabel = orientation === 'black' ? 'Black to move' : 'White to move'
  const selectedGame = useMemo(() => {
    if (!selectedMeta?.gameId) return undefined
    const arr = (games as any[]) || []
    return arr.find((g) => String((g as any)?.id ?? '') === String(selectedMeta.gameId))
  }, [games, selectedMeta])
  const selectedPGN = useMemo(() => {
    const raw: string | undefined = (selectedGame?.pgn?.raw as string) ?? (typeof (selectedGame as any)?.pgn === 'string' ? (selectedGame as any).pgn : undefined)
    return raw ?? ''
  }, [selectedGame])
  const openings = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of games as any[]) {
      const name = String(g?.opening?.name ?? 'Unknown')
      counts[name] = (counts[name] ?? 0) + 1
    }
    console.log('Dashboard: Available openings from loaded games:', counts)
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
  }, [games])

  // Estimate unevaluated game count for the selected opening
  const unevaluatedCountForSelected = useMemo(() => {
    if (!selectedOpening) return 0
    let total = 0
    for (const g of games as any[]) {
      const name = String(g?.opening?.name ?? 'Unknown')
      if (name !== selectedOpening) continue
      const analyzedMoves: any[] = Array.isArray((g as any)?.analysis) ? ((g as any).analysis as any[]) : []
      const hasJudgments = analyzedMoves.some((mv) => mv?.judgment?.name)
      const hasCp = analyzedMoves.some((mv) => typeof mv?.eval?.cp === 'number')
      if (!hasJudgments && !hasCp) total += 1
    }
    return total
  }, [games, selectedOpening])

  const filteredGames = useMemo(() => {
    if (!selectedOpening) return games
    return (games as any[]).filter((g) => String(g?.opening?.name ?? 'Unknown') === selectedOpening)
  }, [games, selectedOpening])

  const activeSummary = useMemo(() => {
    // For "All openings", use the provided summary to keep numbers consistent
    // with the backend/worker totals (and avoid recomputation differences).
    if (!selectedOpening) return summary
    return analyzeGames(filteredGames, { onlyForUsername: filterUsername })
  }, [selectedOpening, summary, filteredGames, filterUsername])

  const blunderTotalForPie = useMemo(() => {
    if (selectedOpening) return activeSummary.total.blunders
    const byOpening = activeSummary.blundersByOpening || {}
    return Object.values(byOpening).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0)
  }, [activeSummary, selectedOpening])

  const pieData = [
    { name: 'Blunders', value: blunderTotalForPie },
    { name: 'Mistakes', value: activeSummary.total.mistakes },
    { name: 'Inaccuracies', value: activeSummary.total.inaccuracies },
  ]

  const topOpeningBlunders = Object.entries(activeSummary.blundersByOpening)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([opening, count]) => ({ opening, count }))

  function wrapLabelToLines(label: string, maxCharsPerLine = 16): string[] {
    const normalized = label.replace(/:\s*/g, ': ').replace(/\s+/g, ' ').trim()
    const words = normalized.split(' ')
    const lines: string[] = []
    let current = ''
    const pushCurrent = () => {
      if (current) {
        lines.push(current)
        current = ''
      }
    }
    const pushChunks = (word: string) => {
      if (word.length <= maxCharsPerLine) {
        current = word
        return
      }
      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        const chunk = word.slice(i, i + maxCharsPerLine)
        if (!current) current = chunk
        else {
          pushCurrent()
          current = chunk
        }
      }
    }
    for (const word of words) {
      const next = current ? `${current} ${word}` : word
      if (next.length <= maxCharsPerLine) {
        current = next
      } else {
        pushCurrent()
        pushChunks(word)
      }
    }
    pushCurrent()
    return lines
  }

  function OpeningTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
    const lines = wrapLabelToLines(payload.value, 18)
    const lineHeight = 14
    return (
      <g transform={`translate(${x},${y}) rotate(25)`}>
        <text x={0} y={8} dx={4} textAnchor="start" fill="#374151">
          {lines.map((line, i) => (
            <tspan key={i} x={0} dy={i === 0 ? 0 : lineHeight}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    )
  }

  return (
    <div className="mt-8 animate-fade-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md shadow-sm" role="tablist" aria-label="Chart view">
          <button
            type="button"
            onClick={() => setView('pie')}
            className={`px-4 py-2 text-sm font-medium border border-slate-700 rounded-l-md ${
              view === 'pie' ? 'bg-blue-600 text-white' : 'bg-slate-800/60 text-gray-200 hover:bg-slate-700'
            }`}
            role="tab"
            aria-selected={view === 'pie'}
          >
            Mistake Types
          </button>
          <button
            type="button"
            onClick={() => setView('bar')}
            className={`px-4 py-2 text-sm font-medium border border-slate-700 rounded-r-md -ml-px ${
              view === 'bar' ? 'bg-blue-600 text-white' : 'bg-slate-800/60 text-gray-200 hover:bg-slate-700'
            }`}
            role="tab"
            aria-selected={view === 'bar'}
          >
            Top Blunder Openings
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="opening-filter" className="text-sm text-gray-300">
            Filter by opening:
          </label>
          <select
            id="opening-filter"
            value={selectedOpening ?? ''}
            onChange={(e) => setSelectedOpening(e.target.value ? e.target.value : null)}
            className="px-2 py-1 border border-slate-700 rounded text-sm bg-slate-800/60 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          >
            <option value="">All openings</option>
            {openings.map((op) => (
              <option key={op.name} value={op.name}>
                {op.name} ({op.count})
              </option>
            ))}
          </select>
          {selectedOpening && (
            <button
              type="button"
              onClick={() => setSelectedOpening(null)}
              className="text-sm text-blue-400 hover:text-blue-300"
              aria-label="Reset opening filter"
            >
              Reset
            </button>
          )}
          {selectedOpening && (
            <button
              type="button"
              onClick={async () => {
                try {
                  setIsBootstrapping(true)
                  const payloadGames = games as any[]
                  // Call backend to bootstrap only this opening
                  const result = await apiClient.analyzeGames(payloadGames as any, { onlyForUsername: filterUsername, bootstrapOpening: selectedOpening || undefined })
                  // Update local view immediately by signaling App
                  window.dispatchEvent(new CustomEvent('chutor:bootstrapped', { detail: { opening: selectedOpening, summary: result.summary } }))
                  setBootstrappedOpening(selectedOpening)
                  setIsBootstrapping(false)
                } catch (e) {
                  console.error('Bootstrap failed', e)
                  setIsBootstrapping(false)
                }
              }}
              disabled={isBootstrapping}
              className={`ml-2 text-xs px-2 py-1 rounded border ${isBootstrapping ? 'opacity-60 cursor-wait border-slate-700 text-gray-400 bg-slate-800/40' : bootstrappedOpening === selectedOpening ? 'border-green-700 text-green-300 bg-green-900/20' : 'border-slate-700 text-gray-200 bg-slate-800/60 hover:bg-slate-700'}`}
              title={unevaluatedCountForSelected > 0 ? `We found ${unevaluatedCountForSelected} unevaluated game(s) in this opening. Click to bootstrap from known positions.` : 'Bootstrap this opening from known positions'}
            >
              {isBootstrapping
                ? 'Bootstrapping…'
                : bootstrappedOpening === selectedOpening
                ? 'Bootstrapped!'
                : `Bootstrap this opening${unevaluatedCountForSelected > 0 ? ` (${unevaluatedCountForSelected})` : ''}`}
            </button>
          )}
        </div>
      </div>

      {view === 'pie' && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 shadow-sm animate-scale-in">
          <h2 className="mb-4 text-lg font-semibold text-gray-100">Mistake Type Distribution</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie dataKey="value" data={pieData} label>
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {view === 'bar' && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-6 shadow-sm animate-scale-in">
          <h2 className="mb-4 text-lg font-semibold text-gray-100">Top 5 Openings with Most Blunders</h2>
          <div className="h-[32rem] md:h-[36rem] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topOpeningBlunders} margin={{ top: 10, right: 80, left: 40, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="opening" interval={0} height={140} tickMargin={12} tick={<OpeningTick x={0} y={0} payload={{ value: '' }} />} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8, color: '#e5e7eb' }}
                  itemStyle={{ color: '#e5e7eb' }}
                  labelStyle={{ color: '#cbd5e1' }}
                  formatter={(value: any, name: any) => [value as number, 'count']}
                />
                <Bar dataKey="count" fill="#60a5fa" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        <MistakeList
          games={filteredGames}
          summary={activeSummary}
          selected={selectedMeta}
          onSelect={(fen, meta) => {
            setSelectedFen(fen)
            setSelectedMeta({ gameId: meta.gameId, moveNumber: meta.moveNumber })
          }}
        />
        <div className="sticky top-4">
          <div className="mb-2 flex items-center gap-3">
            <div className="text-sm text-gray-400">{toMoveLabel}</div>
            <button
              type="button"
              onClick={async () => {
                try {
                  if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(selectedPGN)
                  } else {
                    const ta = document.createElement('textarea')
                    ta.value = selectedPGN
                    ta.style.position = 'fixed'
                    ta.style.opacity = '0'
                    document.body.appendChild(ta)
                    ta.focus()
                    ta.select()
                    document.execCommand('copy')
                    document.body.removeChild(ta)
                  }
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                } catch {
                  // ignore errors
                }
              }}
              disabled={!selectedPGN}
              className={`text-xs rounded px-2 py-1 border ${!selectedPGN ? 'opacity-50 cursor-not-allowed border-slate-700 text-gray-400' : copied ? 'border-green-700 text-green-300 bg-green-900/20' : 'border-slate-700 text-gray-200 bg-slate-800/60 hover:bg-slate-700'}`}
              aria-label="Copy PGN to clipboard"
              title={!selectedPGN ? 'PGN not available' : copied ? 'Copied!' : 'Copy PGN'}
            >
              {copied ? 'Copied' : 'Copy PGN'}
            </button>
          </div>
          <ChessboardDisplay fen={selectedFen} orientation={orientation} />
        </div>
      </div>
    </div>
  )
}

