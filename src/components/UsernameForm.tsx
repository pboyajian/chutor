import { useState } from 'react'
import { pgnFileToGames } from '../lib/pgn'

export default function UsernameForm({
  onAnalyze,
  isLoading = false,
}: {
  onAnalyze: (username?: string) => void
  isLoading?: boolean
 }) {
  const [username, setUsername] = useState('')
  const [useUpload, setUseUpload] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = username.trim()
    onAnalyze(value || undefined)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const games = await pgnFileToGames(file, 500)
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
        className="flex-1 rounded-md border border-slate-700 bg-slate-800/60 text-gray-200 placeholder:text-gray-500 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500/60 transition disabled:opacity-50"
        aria-label="Lichess username"
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
    </form>
  )
}

