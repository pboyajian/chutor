
import { Chess } from 'chess.js'

export function pgnToGames(pgn: string, maxGames = 25000): any[] {
  if (!pgn || !pgn.trim()) {
    return []
  }
  // Split games by looking for the start of a new [Event] tag
  // This is more reliable than trying to split on blank lines
  const pgnGames = pgn.trim().split(/(?=\[Event\s)/g).filter(game => game.trim())
  const games: any[] = []

  for (const gamePgn of pgnGames) {
    if (games.length >= maxGames) break
    if (gamePgn.trim()) {
      games.push(parsePgn(gamePgn.trim()))
    }
  }

  return games
}

function parsePgn(pgn: string): any {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (e) {
    // If chess.js fails to parse, just use what we have
  }
  const headers = chess.header()
  const moves = chess
    .history({ verbose: true })
    .map((m) => m.san)
    .join(' ')

  // Basic info
  const event = headers.Event
  const site = headers.Site
  const date = headers.Date?.replace(/\./g, '-')
  const white = headers.White
  const black = headers.Black
  const result = headers.Result
  const eco = headers.ECO
  const opening = headers.Opening
  const termination = headers.Termination
  const timeControl = headers.TimeControl

  // Lichess-specific
  const id = site && /lichess\.org\/([A-Za-z0-9]{8})/.exec(site)?.[1]
  const speed = event?.includes('Blitz')
    ? 'blitz'
    : event?.includes('Rapid')
    ? 'rapid'
    : event?.includes('Classical')
    ? 'classical'
    : 'correspondence'

  return {
    id,
    speed,
    perf: speed,
    rated: event?.includes('Rated'),
    createdAt: new Date(date || 0).getTime(),
    lastMoveAt: new Date(date || 0).getTime(),
    status: termination?.toLowerCase().includes('abnormal') ? 'aborted' : 'unknown',
    players: {
      white: { user: { name: white }, rating: headers.WhiteElo },
      black: { user: { name: black }, rating: headers.BlackElo },
    },
    opening: {
      eco,
      name: opening,
    },
    moves,
    pgn: pgn.trim(),
    clock: {
      initial: parseInt(timeControl?.split('+')[0] || '0', 10),
      increment: parseInt(timeControl?.split('+')[1] || '0', 10),
      totalTime: 0,
    },
    winner: result === '1-0' ? 'white' : result === '0-1' ? 'black' : undefined,
  }
}
