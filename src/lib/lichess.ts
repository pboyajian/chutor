export interface LichessGame {
  [key: string]: unknown
}

export class LichessError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LichessError'
    this.status = status
  }
}

export async function fetchLichessGames(
  username: string,
  opts: { signal?: AbortSignal; max?: number } = {},
): Promise<LichessGame[]> {
  if (!username || !username.trim()) {
    throw new LichessError('Username is required')
  }

  const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(username.trim())}`)
  url.searchParams.set('evals', 'true')
  url.searchParams.set('opening', 'true')
  url.searchParams.set('pgnInJson', 'true')
  if (typeof opts.max === 'number') url.searchParams.set('max', String(opts.max))

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/x-ndjson' },
      signal: opts.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new LichessError('Network error while fetching Lichess games')
  }

  if (!response.ok) {
    if (response.status === 404) throw new LichessError('Lichess user not found', 404)
    throw new LichessError(`Failed to fetch Lichess games (${response.status})`, response.status)
  }

  const games: LichessGame[] = []

  if (!response.body) {
    const text = await response.text()
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      games.push(JSON.parse(trimmed))
    }
    return games
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const obj = JSON.parse(trimmed)
      games.push(obj)
    }
  }
  const tail = buffer.trim()
  if (tail) games.push(JSON.parse(tail))
  return games
}

export default fetchLichessGames

