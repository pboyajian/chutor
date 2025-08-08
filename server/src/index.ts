const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const { Worker } = require('worker_threads')
const os = require('os')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(helmet())
app.use(compression())
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))

// Health check endpoint
app.get('/health', (req: any, res: any) => {
  return res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// Parallel analysis with multiple workers
async function analyzeWithParallelWorkers(games: any[], options: any = {}): Promise<any> {
  const numCPUs = os.cpus().length
  const numWorkers = Math.min(numCPUs, 8) // Cap at 8 workers to avoid overhead
  const chunkSize = Math.ceil(games.length / numWorkers)
  
  console.log(`🔄 Starting parallel analysis with ${numWorkers} workers`)
  console.log(`📊 Processing ${games.length} games in chunks of ~${chunkSize}`)
  
  const startTime = Date.now()
  const workers: any[] = []
  const results: any[] = []
  let completedWorkers = 0
  
  // Create progress tracking
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime
    console.log(`⏱️  Progress: ${completedWorkers}/${numWorkers} workers completed (${elapsed}ms elapsed)`)
  }, 1000)
  
  try {
    // Split games into chunks
    const chunks: any[][] = []
    for (let i = 0; i < games.length; i += chunkSize) {
      chunks.push(games.slice(i, i + chunkSize))
    }
    
    console.log(`📦 Created ${chunks.length} chunks for parallel processing`)
    
    // Process each chunk in parallel
    const promises = chunks.map((chunk, index) => {
      return new Promise<any>((resolve, reject) => {
        const worker = new Worker('./src/worker-thread.js')
        workers.push(worker)
        
        console.log(`🚀 Starting worker ${index + 1} with ${chunk.length} games`)
        
        worker.on('message', (response: any) => {
          if (response.type === 'result') {
            completedWorkers++
            console.log(`✅ Worker ${index + 1} completed (${chunk.length} games processed)`)
            worker.terminate()
            resolve(response.data)
          } else if (response.type === 'error') {
            console.error(`❌ Worker ${index + 1} failed:`, response.data.error)
            worker.terminate()
            reject(new Error(response.data.error))
          } else if (response.type === 'progress') {
            console.log(`📈 Worker ${index + 1} progress: ${response.data.current}/${response.data.total} games`)
          }
        })

        worker.on('error', (error: any) => {
          console.error(`💥 Worker ${index + 1} crashed:`, error)
          worker.terminate()
          reject(error)
        })

        worker.postMessage({
          type: 'analyze',
          data: { games: chunk, options, workerId: index + 1 }
        })
      })
    })
    
    // Wait for all workers to complete
    const workerResults: any[] = await Promise.all(promises)
    
    clearInterval(progressInterval)
    
    console.log(`🎉 All workers completed! Merging results...`)
    
    // Merge results from all workers
    const mergedSummary = {
      total: { inaccuracies: 0, mistakes: 0, blunders: 0 },
      mistakesByOpening: {} as Record<string, number>,
      blundersByOpening: {} as Record<string, number>,
      topBlunders: [] as any[],
      topMistakes: [] as any[],
    }
    
    let totalProcessingTime = 0
    let totalGameCount = 0
    let detectedUsername: string | undefined
    
    for (const result of workerResults) {
      // Merge totals
      mergedSummary.total.inaccuracies += result.summary.total.inaccuracies
      mergedSummary.total.mistakes += result.summary.total.mistakes
      mergedSummary.total.blunders += result.summary.total.blunders
      
      // Merge opening stats
      for (const [opening, count] of Object.entries(result.summary.mistakesByOpening)) {
        mergedSummary.mistakesByOpening[opening] = (mergedSummary.mistakesByOpening[opening] || 0) + (count as number)
      }
      for (const [opening, count] of Object.entries(result.summary.blundersByOpening)) {
        mergedSummary.blundersByOpening[opening] = (mergedSummary.blundersByOpening[opening] || 0) + (count as number)
      }
      
      // Merge top blunders
      mergedSummary.topBlunders.push(...result.summary.topBlunders)
      // Merge top mistakes (all types)
      if (Array.isArray(result.summary.topMistakes)) {
        mergedSummary.topMistakes.push(...result.summary.topMistakes)
      }
      
      // Track processing stats
      totalProcessingTime = Math.max(totalProcessingTime, result.processingTime)
      totalGameCount += result.gameCount
      if (result.detectedUsername) {
        detectedUsername = result.detectedUsername
      }
    }
    
    // Sort merged top lists
    mergedSummary.topBlunders.sort((a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
    mergedSummary.topMistakes.sort((a: any, b: any) => (b.centipawnLoss ?? 0) - (a.centipawnLoss ?? 0))
    
    const totalTime = Date.now() - startTime
    
    console.log(`📊 Merged results: ${mergedSummary.total.blunders} blunders, ${mergedSummary.total.mistakes} mistakes, ${mergedSummary.total.inaccuracies} inaccuracies`)
    console.log(`⚡ Total processing time: ${totalTime}ms (parallel speedup: ${(totalProcessingTime / totalTime).toFixed(2)}x)`)
    
    return {
      summary: mergedSummary,
      processingTime: totalTime,
      gameCount: totalGameCount,
      detectedUsername,
      parallelStats: {
        workers: numWorkers,
        chunkSize,
        speedup: totalProcessingTime / totalTime
      }
    }
    
  } catch (error) {
    clearInterval(progressInterval)
    console.error('❌ Parallel analysis failed:', error)
    throw error
  } finally {
    // Clean up any remaining workers
    workers.forEach(worker => {
      try {
        worker.terminate()
      } catch (e) {
        // Ignore termination errors
      }
    })
  }
}

// Analysis endpoint
app.post('/api/analyze', async (req: any, res: any) => {
  try {
    const { games, options } = req.body
    
    if (!games || !Array.isArray(games) || games.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request: games array is required and must not be empty' 
      })
    }

    console.log(`🎯 Starting analysis of ${games.length} games...`)
    console.log(`🔧 Options:`, options)
    
    // Use parallel workers for better performance
    const result: any = await analyzeWithParallelWorkers(games, options)
    
    console.log(`✅ Analysis completed successfully!`)
    console.log(`📈 Final stats: ${result.summary.total.blunders} blunders, ${result.summary.total.mistakes} mistakes, ${result.summary.total.inaccuracies} inaccuracies`)
    
    return res.json({
      success: true,
      summary: result.summary,
      processingTime: result.processingTime,
      gameCount: result.gameCount,
      detectedUsername: result.detectedUsername,
      parallelStats: result.parallelStats
    })
    
  } catch (error) {
    console.error('💥 Analysis error:', error)
    return res.status(500).json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Get server info
app.get('/api/info', (req: any, res: any) => {
  return res.json({
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    },
    uptime: os.uptime(),
    nodeVersion: process.version
  })
})

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('💥 Unhandled error:', err)
  return res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use('*', (req: any, res: any) => {
  return res.status(404).json({ error: 'Endpoint not found' })
})

app.listen(PORT, () => {
  console.log(`🚀 Chutor analysis server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🔍 Analysis endpoint: http://localhost:${PORT}/api/analyze`)
  console.log(`ℹ️  Server info: http://localhost:${PORT}/api/info`)
  console.log(`⚡ Parallel processing: ${os.cpus().length} CPU cores available`)
})
