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
        extractGameNames['pgnWhite']) ?? extractGameNames['noop']
    const black =
      ((game?.players?.black?.user?.name as string | undefined) ||
        (game?.players?.black?.userId as string | undefined) ||
        (game?.players?.black?.name as string | undefined) ||
        (game?.black?.user?.name as string | undefined) ||
        (game?.black?.name as string | undefined) ||
        extractGameNames['pgnBlack']) ?? extractGameNames['noop']
    const pgnWhite = fromPgn(pgnRaw, 'White')
    const pgnBlack = fromPgn(pgnRaw, 'Black')
    return { white: white || pgnWhite, black: black || pgnBlack }
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
    try {
      setSelectedUsername(username ?? null)
      if (uploadedGames && uploadedGames.length) {
        setGames(uploadedGames)
        // Yield to the browser so loading UI can render before heavy analysis
        await new Promise((resolve) => setTimeout(resolve, 0))
        const detected = deriveUsernameFromGames(uploadedGames)
        setSelectedUsername(detected ?? null)
        setSummary(analyzeGames(uploadedGames, { onlyForUsername: detected }))
      } else {
        const abort = new AbortController()
        try {
          const data = await fetchLichessGames(username, { max: 2000, signal: abort.signal })
          setGames(data)
          // Yield to paint spinner before analysis
          await new Promise((resolve) => setTimeout(resolve, 0))
          const detected = deriveUsernameFromGames(data)
          setSelectedUsername(detected ?? (username ?? null))
          setSummary(analyzeGames(data, { onlyForUsername: detected ?? username }))
        } finally {
          abort.abort()
        }
      }
    } catch (err) {
      const msg = err instanceof LichessError ? err.message : 'Unexpected error fetching games'
      setError(msg)
    } finally {
      setIsLoading(false)
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
        Promise.resolve()
          .then(() => new Promise((r) => setTimeout(r, 0)))
          .then(() => {
            const detected = deriveUsernameFromGames(uploaded)
            setSelectedUsername(detected ?? null)
            setGames(uploaded)
            setSummary(analyzeGames(uploaded, { onlyForUsername: detected }))
          })
          .catch(() => {})
          .finally(() => setIsLoading(false))
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
      </main>
    </div>
  )
}

