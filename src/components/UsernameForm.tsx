import { useState } from 'react'
import { pgnFileToGames } from '../lib/pgn'

export default function UsernameForm({
  onAnalyze,
  isLoading = false,
}: {
  onAnalyze: (username: string) => void
  isLoading?: boolean
}) {
  const [username, setUsername] = useState('')
  const [useUpload, setUseUpload] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = username.trim()
    if (!value) return
    onAnalyze(value)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const games = await pgnFileToGames(file, 10000)
    const event = new CustomEvent('pgnUploadAnalyzed', { detail: { games } })
    window.dispatchEvent(event)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 w-full max-w-2xl mx-auto flex-wrap">
      <input
        type="text"
        placeholder="Enter Lichess username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={isLoading}
        className="flex-1 rounded border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        aria-label="Lichess username"
      />
      <button
        type="submit"
        disabled={isLoading}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {isLoading ? 'Analyzing…' : 'Analyze'}
      </button>

      <span className="text-gray-400">or</span>
      <div className="flex flex-col">
        <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
          <input
            type="checkbox"
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
            className="block"
          />
        )}
      </div>
    </form>
  )
}

