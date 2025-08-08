import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import UsernameForm from './components/UsernameForm'
import fetchLichessGames, { LichessError, type LichessGame } from './lib/lichess'

export default function App() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [games, setGames] = useState<LichessGame[] | null>(null)

  const handleAnalyze = async (username: string) => {
    setIsLoading(true)
    setError(null)
    setGames(null)
    try {
      const data = await fetchLichessGames(username)
      setGames(data)
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
        setGames(uploaded)
        setError(null)
      }
    }
    window.addEventListener('pgnUploadAnalyzed', onUpload as EventListener)
    return () => window.removeEventListener('pgnUploadAnalyzed', onUpload as EventListener)
  }, [])

  return (
    <div className="p-8 mx-auto max-w-3xl text-center">
      <div>
        <a href="https://vite.dev" target="_blank" rel="noreferrer">
          <img src={viteLogo} className="inline-block h-16" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noreferrer" className="ml-4">
          <img src={reactLogo} className="inline-block h-16" alt="React logo" />
        </a>
      </div>
      <h1 className="text-3xl font-bold my-6">Chutor</h1>

      <UsernameForm onAnalyze={handleAnalyze} isLoading={isLoading} />

      <div className="mt-6 min-h-[2rem]">
        {isLoading && <p>Fetching games...</p>}
        {!isLoading && error && (
          <p className="text-red-600" role="alert">
            {error}
          </p>
        )}
        {!isLoading && !error && games && (
          <p className="text-green-700">Success! Fetched {games.length} games.</p>
        )}
      </div>
    </div>
  )
}

