import { useEffect, useState } from 'react'
import UsernameForm from './components/UsernameForm'
import Dashboard from './components/Dashboard'
import fetchLichessGames, { LichessError, type LichessGame } from './lib/lichess'
import analyzeGames, { type AnalysisSummary } from './lib/analysis'
import Spinner from './components/Spinner'
import DashboardSkeleton from './components/DashboardSkeleton'

export default function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<LichessGame[] | null>(null)
  const [summary, setSummary] = useState<AnalysisSummary | null>(null)
  const [uploadedGames, setUploadedGames] = useState<LichessGame[] | null>(null)
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; phase: string } | null>(null)

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

  async function analyzeGamesWithProgress(games: LichessGame[], options: { onlyForUsername?: string } = {}) {
    const total = games.length
    let current = 0
    const updateInterval = Math.max(1, Math.floor(total / 20)) // Update every 5% or at least every game
    
    setAnalysisProgress({ current: 0, total, phase: 'Analyzing games' })
    
    const summary: AnalysisSummary = {
      total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
      mistakesByOpening: {},
      blundersByOpening: {},
      topBlunders: [],
    }
    
    const normalizedTarget = options.onlyForUsername?.trim().toLowerCase() || ''
    
    for (const game of games) {
      current += 1
      if (current % updateInterval === 0) {
        setAnalysisProgress({ current, total, phase: 'Analyzing games' })
        // Yield to browser to allow progress update to render
        await new Promise(resolve => setTimeout(resolve, 0))
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
      }
    }
    
    summary.topBlunders.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
    
    // Show that we're now preparing the UI
    setAnalysisProgress({ current: total, total, phase: 'Preparing results' })
    await new Promise(resolve => setTimeout(resolve, 100))
    
    return summary
  }

  const handleAnalyze = async (username?: string) => {
    setIsLoading(true)
    setError(null)
    setGames(null)
    setAnalysisProgress(null)
    try {
      setSelectedUsername(username ?? null)
      if (uploadedGames && uploadedGames.length) {
        setGames(uploadedGames)
        // Yield to the browser so loading UI can render before heavy analysis
        await new Promise((resolve) => setTimeout(resolve, 0))
        const detected = deriveUsernameFromGames(uploadedGames)
        setSelectedUsername(detected ?? null)
        setSummary(await analyzeGamesWithProgress(uploadedGames, { onlyForUsername: detected }))
      } else {
        const abort = new AbortController()
        try {
          const data = await fetchLichessGames(username || '', { max: 2000, signal: abort.signal })
          setGames(data)
          // Yield to paint spinner before analysis
          await new Promise((resolve) => setTimeout(resolve, 0))
          const detected = deriveUsernameFromGames(data)
          setSelectedUsername(detected ?? (username ?? null))
          setSummary(await analyzeGamesWithProgress(data, { onlyForUsername: detected ?? username }))
        } finally {
          abort.abort()
        }
      }
    } catch (err) {
      const msg = err instanceof LichessError ? err.message : 'Unexpected error fetching games'
      setError(msg)
    } finally {
      setIsLoading(false)
      setAnalysisProgress(null)
    }
  }

  useEffect(() => {
    const onUpload = (e: any) => {
      const uploaded = e.detail?.games as LichessGame[] | undefined
      if (uploaded && uploaded.length) {
        // Auto analyze for uploaded PGNs by detecting username from games
        setUploadedGames(uploaded)
        setError(null)
        setIsLoading(true)
        setGames(null)
        setAnalysisProgress(null)
        Promise.resolve()
          .then(() => new Promise((r) => setTimeout(r, 0)))
          .then(async () => {
            const detected = deriveUsernameFromGames(uploaded)
            setSelectedUsername(detected ?? null)
            setGames(uploaded)
            setSummary(await analyzeGamesWithProgress(uploaded, { onlyForUsername: detected }))
          })
          .catch(() => {})
          .finally(() => {
            setIsLoading(false)
            setAnalysisProgress(null)
          })
      }
    }
    window.addEventListener('pgnUploadAnalyzed', onUpload as EventListener)
    return () => window.removeEventListener('pgnUploadAnalyzed', onUpload as EventListener)
  }, [])

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-100 tracking-tight">Chutor</h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="text-center mb-8">
          <h2 className="text-xl md:text-2xl font-medium text-gray-100 mb-4">Personalized Chess Improvement</h2>
          <p className="text-gray-400 mb-6">Analyze your Lichess games to uncover recurring mistakes and patterns.</p>
          <UsernameForm onAnalyze={handleAnalyze} isLoading={isLoading} />
        </section>

        <div className="mt-6 min-h-[2rem]">
          {isLoading && (
            <div className="py-6">
              <DashboardSkeleton />
              <div className="flex items-center justify-center py-6">
                <Spinner label="Analyzing your games…" />
              </div>
            </div>
          )}
          {!isLoading && error && (
            <p className="text-red-400" role="alert">
              {error}
            </p>
          )}
          {!isLoading && !error && summary && (
            <>
              <div className="mb-6 rounded-lg border border-slate-800 bg-slate-800/60 p-4 text-left">
                <p className="text-gray-200">Analyzed {games?.length ?? 0} games.</p>
                <p className="mt-1 text-sm text-gray-400">
                  Blunders: {summary.total.blunders}, Mistakes: {summary.total.mistakes}, Inaccuracies: {summary.total.inaccuracies}
                </p>
              </div>
              <Dashboard summary={summary} games={games ?? []} filterUsername={selectedUsername ?? undefined} />
            </>
          )}
        </div>
        {analysisProgress && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 shadow-lg z-50">
            <div className="text-sm text-gray-200">
              {analysisProgress.phase}... {analysisProgress.current} / {analysisProgress.total}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

