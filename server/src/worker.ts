import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { LichessGame, AnalysisSummary, AnalysisRequest } from './types'
import { analyzeGames, deriveUsernameFromGames } from './analysis'

interface WorkerMessage {
  type: 'analyze'
  data: AnalysisRequest
}

interface WorkerResponse {
  type: 'progress' | 'result' | 'error'
  data: any
}

// Worker thread code
if (!isMainThread && parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    if (message.type === 'analyze') {
      try {
        const { games, options } = message.data
        const startTime = Date.now()
        
        // Auto-detect username if not provided
        const targetUsername = options.onlyForUsername || deriveUsernameFromGames(games)
        
        // Perform analysis
        const analysisOptions: { onlyForUsername?: string } = {}
        if (targetUsername) {
          analysisOptions.onlyForUsername = targetUsername
        }
        const summary = analyzeGames(games, analysisOptions)
        
        const processingTime = Date.now() - startTime
        
        const resultData: {
          summary: AnalysisSummary
          processingTime: number
          gameCount: number
          detectedUsername?: string
        } = {
          summary,
          processingTime,
          gameCount: games.length
        }
        
        if (targetUsername) {
          resultData.detectedUsername = targetUsername
        }
        
        parentPort!.postMessage({
          type: 'result',
          data: resultData
        })
      } catch (error) {
        parentPort!.postMessage({
          type: 'error',
          data: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
      }
    }
  })
}

// Main thread code
export class AnalysisWorker {
  private worker: Worker | null = null

  async analyzeGames(games: LichessGame[], options: { onlyForUsername?: string } = {}): Promise<{
    summary: AnalysisSummary
    processingTime: number
    gameCount: number
    detectedUsername?: string
  }> {
    return new Promise((resolve, reject) => {
      // Create a new worker for each analysis
      this.worker = new Worker(__filename, {
        workerData: null
      })

      this.worker.on('message', (response: WorkerResponse) => {
        if (response.type === 'result') {
          this.worker?.terminate()
          this.worker = null
          resolve(response.data)
        } else if (response.type === 'error') {
          this.worker?.terminate()
          this.worker = null
          reject(new Error(response.data.error))
        }
      })

      this.worker.on('error', (error) => {
        this.worker?.terminate()
        this.worker = null
        reject(error)
      })

      // Send analysis request to worker
      this.worker.postMessage({
        type: 'analyze',
        data: { games, options }
      })
    })
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }
}

// Export a function to create multiple workers for parallel processing
export async function analyzeGamesParallel(
  games: LichessGame[], 
  options: { onlyForUsername?: string } = {},
  numWorkers: number = 4
): Promise<{
  summary: AnalysisSummary
  processingTime: number
  gameCount: number
  detectedUsername?: string
}> {
  const startTime = Date.now()
  
  // Split games into chunks for parallel processing
  const chunkSize = Math.ceil(games.length / numWorkers)
  const chunks: LichessGame[][] = []
  
  for (let i = 0; i < games.length; i += chunkSize) {
    chunks.push(games.slice(i, i + chunkSize))
  }

  // Create workers for each chunk
  const workers = chunks.map(chunk => {
    const worker = new AnalysisWorker()
    return worker.analyzeGames(chunk, options)
  })

  try {
    // Wait for all workers to complete
    const results = await Promise.all(workers)
    
    // Merge results
    const mergedSummary: AnalysisSummary = {
      total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
      mistakesByOpening: {},
      blundersByOpening: {},
      topBlunders: []
    }

    results.forEach(result => {
      mergedSummary.total.inaccuracies += result.summary.total.inaccuracies
      mergedSummary.total.mistakes += result.summary.total.mistakes
      mergedSummary.total.blunders += result.summary.total.blunders
      
      // Merge opening statistics
      Object.entries(result.summary.mistakesByOpening).forEach(([opening, count]) => {
        mergedSummary.mistakesByOpening[opening] = (mergedSummary.mistakesByOpening[opening] || 0) + count
      })
      
      Object.entries(result.summary.blundersByOpening).forEach(([opening, count]) => {
        mergedSummary.blundersByOpening[opening] = (mergedSummary.blundersByOpening[opening] || 0) + count
      })
      
      // Merge top blunders
      mergedSummary.topBlunders.push(...result.summary.topBlunders)
    })

    // Sort merged blunders
    mergedSummary.topBlunders.sort((a, b) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))

    const processingTime = Date.now() - startTime
    
    const result: {
      summary: AnalysisSummary
      processingTime: number
      gameCount: number
      detectedUsername?: string
    } = {
      summary: mergedSummary,
      processingTime,
      gameCount: games.length
    }
    
    if (results[0]?.detectedUsername) {
      result.detectedUsername = results[0].detectedUsername
    }
    
    return result
  } finally {
    // Clean up workers
    workers.forEach(worker => {
      if (worker instanceof AnalysisWorker) {
        worker.terminate()
      }
    })
  }
}
