import type { LichessGame, AnalysisSummary } from './lichess'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface AnalysisRequest {
  games: LichessGame[]
  options: {
    onlyForUsername?: string
  }
}

export interface AnalysisResponse {
  success: boolean
  summary: AnalysisSummary
  processingTime: number
  gameCount: number
  detectedUsername?: string
}

export class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl
  }

  async analyzeGames(games: LichessGame[], options: { onlyForUsername?: string } = {}): Promise<AnalysisResponse> {
    const response = await fetch(`${this.baseUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ games, options }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  async getServerInfo() {
    const response = await fetch(`${this.baseUrl}/api/info`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.json()
  }

  async healthCheck() {
    const response = await fetch(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.json()
  }
}

// Export a default instance
export const apiClient = new ApiClient()
