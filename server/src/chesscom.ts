
const CHESSCOM_API_BASE = 'https://api.chess.com/pub'

export class ChesscomError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ChesscomError'
    this.status = status
  }
}

export async function getMonthlyArchives(username: string): Promise<string[]> {
  const url = `${CHESSCOM_API_BASE}/player/${username}/games/archives`
  try {
    // Use Node.js built-in fetch (available in Node 18+)
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'chutor-analysis/1.0 (contact@chutor.dev)', // Chess.com asks for a user-agent
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        throw new ChesscomError('Chess.com user not found', 404)
      }
      throw new ChesscomError(`Failed to fetch archives: ${response.statusText}`, response.status)
    }

    const data: any = await response.json()
    return data.archives || []
  } catch (err) {
    if (err instanceof ChesscomError) throw err
    console.error('Network error fetching Chess.com archives:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown network error'
    throw new ChesscomError(`Network error while fetching Chess.com archives: ${errorMessage}`)
  }
}

export async function fetchPgnFromArchives(archives: string[]): Promise<string> {
  const pgnResponses = await Promise.all(
    archives.map(async (url) => {
      try {
        // Use Node.js built-in fetch (available in Node 18+)
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'chutor-analysis/1.0 (contact@chutor.dev)',
          },
        })
        if (!response.ok) {
          console.warn(`Failed to fetch archive ${url}: ${response.statusText}`)
          return '' // Return empty string for failed requests
        }
        return response.text()
      } catch (err) {
        console.warn(`Error fetching archive ${url}:`, err instanceof Error ? err.message : err)
        return '' // Return empty string for network errors
      }
    }),
  )

  return pgnResponses.join('\\n\\n')
}
