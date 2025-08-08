export interface LichessGame {
  id: string
  players: {
    white: { user: { name: string } | null }
    black: { user: { name: string } | null }
  }
  opening: { name: string } | null
  analysis: Array<{
    ply: number
    eval?: { cp: number; mate?: number }
    judgment?: { name: string; cp: number; comment?: string }
    best?: string
    comment?: string
  }>
  pgn?: { raw: string }
}

export interface AnalysisSummary {
  total: {
    inaccuracies: number
    mistakes: number
    blunders: number
  }
  mistakesByOpening: Record<string, number>
  blundersByOpening: Record<string, number>
  topBlunders: Array<{
    gameId: string
    moveNumber: number
    ply: number
    side: 'white' | 'black'
    centipawnLoss?: number
  }>
}

export interface AnalysisRequest {
  games: LichessGame[]
  options: {
    onlyForUsername?: string
  }
}

export interface AnalysisResponse {
  summary: AnalysisSummary
  processingTime: number
  gameCount: number
}

export interface ProgressUpdate {
  current: number
  total: number
  phase: string
  timestamp: number
}
