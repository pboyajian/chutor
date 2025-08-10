import { useState } from 'react'
import { pgnFileToGames } from '../lib/pgn'

export type Platform = 'lichess' | 'chess.com'

export default function UsernameForm({
  onAnalyze,
  isLoading = false,
}: {
  onAnalyze: (platform: Platform, username?: string) => void
  isLoading?: boolean
}) {
  const [username, setUsername] = useState('')
  const [platform, setPlatform] = useState<Platform>('lichess')
  const [useUpload, setUseUpload] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = username.trim()
    onAnalyze(platform, value || undefined)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const games = await pgnFileToGames(file, 25000)
    const event = new CustomEvent('pgnUploadAnalyzed', { detail: { games } })
    window.dispatchEvent(event)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 w-full max-w-2xl mx-auto">
      <div className="flex justify-center gap-4 mb-2">
        <label className="flex items-center gap-2 cursor-pointer text-gray-200">
          <input
            type="radio"
            name="platform"
            value="lichess"
            checked={platform === 'lichess'}
            onChange={() => setPlatform('lichess')}
            disabled={isLoading}
            className="accent-blue-600"
          />
          Lichess
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-gray-200">
          <input
            type="radio"
            name="platform"
            value="chess.com"
            checked={platform === 'chess.com'}
            onChange={() => setPlatform('chess.com')}
            disabled={isLoading}
            className="accent-blue-600"
          />
          Chess.com
        </label>
      </div>
      <div className="flex items-center gap-3 w-full">
        <input
          type="text"
          placeholder={`Enter ${platform === 'lichess' ? 'Lichess' : 'Chess.com'} username`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          className="flex-1 rounded-md border border-slate-700 bg-slate-800/60 text-gray-200 placeholder:text-gray-500 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/60 transition disabled:opacity-50"
          aria-label={`${platform === 'lichess' ? 'Lichess' : 'Chess.com'} username`}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 transition disabled:opacity-50"
        >
          {isLoading ? 'Analyzing…' : 'Analyze'}
        </button>

        <span className="text-gray-500">or</span>
        <div className="flex flex-col text-left">
          <label className="inline-flex items-center gap-2 cursor-pointer mb-1 text-gray-300">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={useUpload}
              onChange={(e) => setUseUpload(e.target.checked)}
            />
            Upload PGN
          </label>
          {useUpload && (
            <input
              type="file"
              accept=".pgn,.txt,.png"
              onChange={handleFileChange}
              disabled={isLoading}
              className="block text-sm text-gray-300 file:mr-4 file:rounded-md file:border-0 file:bg-slate-700 file:text-gray-200 file:px-3 file:py-2 hover:file:bg-slate-600 transition"
            />
          )}
        </div>
      </div>
    </form>
  )
}

