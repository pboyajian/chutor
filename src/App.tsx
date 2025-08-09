import { useEffect, useState, useRef } from 'react'
import { Chess } from 'chess.js'
import UsernameForm from './components/UsernameForm'
import Dashboard from './components/Dashboard'
import DashboardSkeleton from './components/DashboardSkeleton'
import Spinner from './components/Spinner'
import { fetchLichessGames, LichessError } from './lib/lichess'
import { apiClient } from './lib/api'
import { computeDatasetKey } from './lib/datasetHash'
import { idbGet, idbSet } from './lib/idbCache'
import type { LichessGame } from './lib/lichess'
import type { AnalysisSummary } from './lib/analysis'

export default function App() {
  const [games, setGames] = useState<LichessGame[] | null>(null)
  const [summary, setSummary] = useState<AnalysisSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [uploadedGames, setUploadedGames] = useState<LichessGame[] | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [debugLogs, setDebugLogs] = useState<Array<{ message: string; timestamp: number; data?: any }>>([])
  const [debugPanelVisible, setDebugPanelVisible] = useState(false)
  const debugScrollRef = useRef<HTMLDivElement>(null)
  const appStartRef = useRef<number>(performance.now())

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

  const handleAnalyze = async (username?: string) => {
    setIsLoading(true)
    setError(null)
    setGames(null)
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
        // Client-side cache: try IndexedDB first
        const key = computeDatasetKey(uploadedGames as any, { onlyForUsername: detected })
        try {
          const cached = await idbGet<AnalysisSummary>(key)
          if (cached) {
            if ((import.meta as any).env?.DEV) console.log(`IDB hit: ${key}`)
            setSummary(cached.summary)
            // Background validation
            apiClient.analyzeGames(uploadedGames, { onlyForUsername: detected }).then(async (server) => {
              const serverVersion = (server as any)?.meta?.version as number | undefined
              if (!serverVersion || serverVersion > (cached.version || 0)) {
                await idbSet({ key, summary: server.summary, createdAt: Date.now(), version: serverVersion || (cached.version || 1) })
                if ((import.meta as any).env?.DEV) console.log('validated cache updated')
                setSummary(server.summary)
              }
            }).catch(() => {})
          } else {
            const result = await apiClient.analyzeGames(uploadedGames, { onlyForUsername: detected })
            setSummary(result.summary)
            const v = (result as any)?.meta?.version as number | undefined
            await idbSet({ key, summary: result.summary, createdAt: Date.now(), version: v || 1 })
          }
        } catch {
          const result = await apiClient.analyzeGames(uploadedGames, { onlyForUsername: detected })
          setSummary(result.summary)
        }
        
        // Add debug log
        setDebugLogs(prev => [...prev, {
          message: 'Analysis ready (cached or server)',
          timestamp: Date.now(),
        }])
      } else {
        const abort = new AbortController()
        try {
          const data = await fetchLichessGames(username || '', { max: 2000, signal: abort.signal })
          setGames(data)
          // Show immediate feedback
          setIsAnalyzing(true)
          const detected = deriveUsernameFromGames(data)
          setSelectedUsername(detected ?? (username ?? null))
          // Client-side cache: try IndexedDB first
          const key = computeDatasetKey(data as any, { onlyForUsername: detected ?? username })
          try {
            const cached = await idbGet<AnalysisSummary>(key)
            if (cached) {
              if ((import.meta as any).env?.DEV) console.log(`IDB hit: ${key}`)
              setSummary(cached.summary)
              // Background validation
              apiClient.analyzeGames(data, { onlyForUsername: detected ?? username }).then(async (server) => {
                const serverVersion = (server as any)?.meta?.version as number | undefined
                if (!serverVersion || serverVersion > (cached.version || 0)) {
                  await idbSet({ key, summary: server.summary, createdAt: Date.now(), version: serverVersion || (cached.version || 1) })
                  if ((import.meta as any).env?.DEV) console.log('validated cache updated')
                  setSummary(server.summary)
                }
              }).catch(() => {})
            } else {
              const result = await apiClient.analyzeGames(data, { onlyForUsername: detected ?? username })
              setSummary(result.summary)
              const v = (result as any)?.meta?.version as number | undefined
              await idbSet({ key, summary: result.summary, createdAt: Date.now(), version: v || 1 })
            }
          } catch {
            const result = await apiClient.analyzeGames(data, { onlyForUsername: detected ?? username })
            setSummary(result.summary)
          }
          
          // Add debug log
          setDebugLogs(prev => [...prev, {
            message: 'Analysis ready (cached or server)',
            timestamp: Date.now(),
          }])
        } finally {
          abort.abort()
        }
      }
    } catch (err) {
      const msg = err instanceof LichessError ? err.message : 'Unexpected error fetching games'
      setError(msg)
      
      // Add error to debug logs
      setDebugLogs(prev => [...prev, {
        message: 'Analysis error',
        timestamp: Date.now(),
        data: { error: msg }
      }])
    } finally {
      setIsLoading(false)
      setIsAnalyzing(false)
    }
  }

  useEffect(() => {
    // DEV-only instrumentation: log when Dashboard becomes visible
    if ((import.meta as any).env?.DEV) {
      if (!isLoading && !isAnalyzing && !error && summary) {
        const elapsed = Math.round(performance.now() - appStartRef.current)
        console.log(`Dashboard mount: ${elapsed}ms`)
      }
    }
  }, [isLoading, isAnalyzing, error, summary])

  useEffect(() => {
    const onUpload = (e: any) => {
      const uploaded = e.detail?.games as LichessGame[] | undefined
      if (uploaded && uploaded.length) {
        // Auto analyze for uploaded PGNs by detecting username from games
        setUploadedGames(uploaded)
        setError(null)
        setIsLoading(true)
        setGames(null)
        setIsAnalyzing(false)
        Promise.resolve()
          .then(async () => {
            const detected = deriveUsernameFromGames(uploaded)
            setSelectedUsername(detected ?? null)
            setGames(uploaded)
            // Show immediate feedback
            setIsAnalyzing(true)
            // Client-side cache
            const key = computeDatasetKey(uploaded as any, { onlyForUsername: detected })
            try {
              const cached = await idbGet<AnalysisSummary>(key)
              if (cached) {
                if ((import.meta as any).env?.DEV) console.log(`IDB hit: ${key}`)
                setSummary(cached.summary)
                apiClient.analyzeGames(uploaded, { onlyForUsername: detected }).then(async (server) => {
                  const serverVersion = (server as any)?.meta?.version as number | undefined
                  if (!serverVersion || serverVersion > (cached.version || 0)) {
                    await idbSet({ key, summary: server.summary, createdAt: Date.now(), version: serverVersion || (cached.version || 1) })
                    if ((import.meta as any).env?.DEV) console.log('validated cache updated')
                    setSummary(server.summary)
                  }
                }).catch(() => {})
              } else {
                const result = await apiClient.analyzeGames(uploaded, { onlyForUsername: detected })
                setSummary(result.summary)
                const v = (result as any)?.meta?.version as number | undefined
                await idbSet({ key, summary: result.summary, createdAt: Date.now(), version: v || 1 })
              }
            } catch {
              const result = await apiClient.analyzeGames(uploaded, { onlyForUsername: detected })
              setSummary(result.summary)
            }
            
            // Add debug log
            setDebugLogs(prev => [...prev, {
              message: 'Analysis ready (cached or server)',
              timestamp: Date.now(),
            }])
          })
          .catch((error) => {
            setError('Failed to analyze uploaded games')
            setDebugLogs(prev => [...prev, {
              message: 'Upload analysis error',
              timestamp: Date.now(),
              data: { error: error.message }
            }])
          })
          .finally(() => {
            setIsLoading(false)
            setIsAnalyzing(false)
          })
      }
    }
    window.addEventListener('pgnUploadAnalyzed', onUpload as EventListener)
    return () => window.removeEventListener('pgnUploadAnalyzed', onUpload as EventListener)
  }, [])

  // Listen for bootstrapped summary update (from Dashboard action)
  useEffect(() => {
    const handler = (e: any) => {
      const s = e?.detail?.summary as AnalysisSummary | undefined
      const openingFromEvent: string | undefined = e?.detail?.opening as string | undefined
      if (!s) return
      setSummary((prev) => {
        if (!prev) return s
        const existing = prev
        const incoming = s
        const boot = Array.isArray(incoming.topMistakes)
          ? incoming.topMistakes.filter((m: any) => (m as any)?.bootstrapped)
          : []
        if (boot.length === 0) return existing
        // Deduplicate against existing topMistakes
        const existingKeys = new Set(
          (existing.topMistakes || []).map((m: any) => `${m.gameId}#${m.ply}#${m.kind}#${m.centipawnLoss ?? ''}#${(m as any).bootstrapped ? 'b' : 'r'}`),
        )
        const dedupedBoot = boot.filter(
          (m: any) => !existingKeys.has(`${m.gameId}#${m.ply}#${m.kind}#${m.centipawnLoss ?? ''}#${(m as any).bootstrapped ? 'b' : 'r'}`),
        )
        if (dedupedBoot.length === 0) return existing
        const incInacc = dedupedBoot.filter((m: any) => m.kind === 'inaccuracy').length
        const incMist = dedupedBoot.filter((m: any) => m.kind === 'mistake').length
        const incBlun = dedupedBoot.filter((m: any) => m.kind === 'blunder').length
        const next: AnalysisSummary = {
          ...existing,
          total: {
            inaccuracies: existing.total.inaccuracies + incInacc,
            mistakes: existing.total.mistakes + incMist,
            blunders: existing.total.blunders + incBlun,
          },
          mistakesByOpening: {
            ...existing.mistakesByOpening,
            ...(openingFromEvent
              ? { [openingFromEvent]: (existing.mistakesByOpening[openingFromEvent] || 0) + dedupedBoot.length }
              : {}),
          },
          blundersByOpening: {
            ...existing.blundersByOpening,
            ...(openingFromEvent
              ? { [openingFromEvent]: (existing.blundersByOpening[openingFromEvent] || 0) + incBlun }
              : {}),
          },
          topMistakes: [...(existing.topMistakes || []), ...dedupedBoot].sort(
            (a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0),
          ),
        }
        return next
      })
      // Keep UI stable; do not toggle analyzing to avoid remounting Dashboard
    }
    window.addEventListener('chutor:bootstrapped', handler as EventListener)
    return () => window.removeEventListener('chutor:bootstrapped', handler as EventListener)
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

