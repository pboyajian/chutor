import { useEffect, useState, useRef } from 'react'
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
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [debugLogs, setDebugLogs] = useState<Array<{ message: string; timestamp: number; data?: any }>>([])
  const [debugPanelVisible, setDebugPanelVisible] = useState(true)
  const debugScrollRef = useRef<HTMLDivElement>(null)

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

  const analyzeWithWorker = (games: LichessGame[], options: { onlyForUsername?: string } = {}) => {
    return new Promise<AnalysisSummary>((resolve, reject) => {
      // Create a new worker for each analysis to avoid conflicts
      const worker = new Worker(new URL('./workers/analysis.worker.ts', import.meta.url), { type: 'module' })
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'progress') {
          setAnalysisProgress(event.data)
        } else if (event.data.type === 'debug') {
          setDebugLogs(prev => {
            const newLogs = [...prev, { 
              message: event.data.message, 
              timestamp: event.data.timestamp, 
              data: event.data.data 
            }]
            // Keep only last 100 logs to prevent memory issues
            return newLogs.slice(-100)
          })
        } else if (event.data.type === 'result') {
          worker.removeEventListener('message', handleMessage)
          worker.terminate() // Clean up the worker
          console.log('Worker result received:', event.data.summary)
          resolve(event.data.summary)
        } else if (event.data.type === 'error') {
          worker.removeEventListener('message', handleMessage)
          worker.terminate() // Clean up the worker
          reject(new Error(event.data.error))
        }
      }

      worker.addEventListener('message', handleMessage)
      worker.postMessage({ type: 'analyze', games, options })
    })
  }

  const handleAnalyze = async (username?: string) => {
    setIsLoading(true)
    setError(null)
    setGames(null)
    setAnalysisProgress(null)
    setIsAnalyzing(false)
    setDebugLogs([]) // Clear debug logs
    try {
      setSelectedUsername(username ?? null)
      if (uploadedGames && uploadedGames.length) {
        setGames(uploadedGames)
        // Show immediate feedback
        setIsAnalyzing(true)
        const detected = deriveUsernameFromGames(uploadedGames)
        setSelectedUsername(detected ?? null)
        const result = await analyzeWithWorker(uploadedGames, { onlyForUsername: detected })
        console.log('Analysis completed, setting summary:', result)
        setSummary(result)
      } else {
        const abort = new AbortController()
        try {
          const data = await fetchLichessGames(username || '', { max: 2000, signal: abort.signal })
          setGames(data)
          // Show immediate feedback
          setIsAnalyzing(true)
          const detected = deriveUsernameFromGames(data)
          setSelectedUsername(detected ?? (username ?? null))
          const result = await analyzeWithWorker(data, { onlyForUsername: detected ?? username })
          setSummary(result)
        } finally {
          abort.abort()
        }
      }
    } catch (err) {
      const msg = err instanceof LichessError ? err.message : 'Unexpected error fetching games'
      setError(msg)
    } finally {
      setIsLoading(false)
      setIsAnalyzing(false)
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
        setIsAnalyzing(false)
        Promise.resolve()
          .then(async () => {
            const detected = deriveUsernameFromGames(uploaded)
            setSelectedUsername(detected ?? null)
            setGames(uploaded)
            // Show immediate feedback
            setIsAnalyzing(true)
            const result = await analyzeWithWorker(uploaded, { onlyForUsername: detected })
            console.log('Analysis completed, setting summary:', result)
            setSummary(result)
          })
          .catch(() => {})
          .finally(() => {
            setIsLoading(false)
            setIsAnalyzing(false)
            setAnalysisProgress(null)
          })
      }
    }
    window.addEventListener('pgnUploadAnalyzed', onUpload as EventListener)
    return () => window.removeEventListener('pgnUploadAnalyzed', onUpload as EventListener)
  }, [])

  // Auto-scroll debug logs to bottom
  useEffect(() => {
    if (debugScrollRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        if (debugScrollRef.current) {
          debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight
        }
      })
    }
  }, [debugLogs.length])

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
          {isLoading && !isAnalyzing && (
            <div className="py-6">
              <DashboardSkeleton />
              <div className="flex items-center justify-center py-6">
                <Spinner label="Loading games…" />
              </div>
            </div>
          )}
          {isAnalyzing && (
            <div className="py-6">
              <DashboardSkeleton />
              <div className="flex items-center justify-center py-6">
                <Spinner label="Analyzing games…" />
              </div>
            </div>
          )}
          {!isLoading && !isAnalyzing && error && (
            <p className="text-red-400" role="alert">
              {error}
            </p>
          )}
          {!isLoading && !isAnalyzing && !error && summary && (
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
        {debugLogs.length > 0 && debugPanelVisible && (
          <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg z-50 max-w-md max-h-96 overflow-hidden">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-semibold text-gray-200">Debug Logs ({debugLogs.length})</div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (debugScrollRef.current) {
                      debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight
                    }
                  }}
                  className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-gray-300"
                >
                  Scroll to Bottom
                </button>
                <button 
                  onClick={() => setDebugPanelVisible(false)}
                  className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-gray-300"
                >
                  Minimize
                </button>
              </div>
            </div>
            <div ref={debugScrollRef} className="space-y-1 text-xs overflow-y-auto max-h-80" style={{ scrollbarWidth: 'thin' }}>
              {debugLogs.map((log, index) => (
                <div key={index} className="text-gray-300 border-b border-slate-700 pb-1">
                  <div className="font-mono">[{log.timestamp.toFixed(1)}ms] {log.message}</div>
                  {log.data && (
                    <div className="text-gray-400 ml-2">
                      {JSON.stringify(log.data, null, 2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {debugLogs.length > 0 && !debugPanelVisible && (
          <div className="fixed bottom-4 right-4 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 shadow-lg z-50">
            <button 
              onClick={() => setDebugPanelVisible(true)}
              className="text-xs text-gray-300 hover:text-white"
            >
              Show Debug Logs ({debugLogs.length})
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

