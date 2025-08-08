const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const { Worker } = require('worker_threads')

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

// Simple worker function
async function analyzeWithWorker(games: any[], options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./src/worker-thread.js')
    
    worker.on('message', (response: any) => {
      if (response.type === 'result') {
        worker.terminate()
        resolve(response.data)
      } else if (response.type === 'error') {
        worker.terminate()
        reject(new Error(response.data.error))
      }
    })

    worker.on('error', (error: any) => {
      worker.terminate()
      reject(error)
    })

    worker.postMessage({
      type: 'analyze',
      data: { games, options }
    })
  })
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

    console.log(`Starting analysis of ${games.length} games...`)
    
    // For now, use single worker to avoid complexity
    const result: any = await analyzeWithWorker(games, options)
    
    console.log(`Analysis completed in ${result.processingTime}ms`)
    console.log(`Found ${result.summary.total.blunders} blunders, ${result.summary.total.mistakes} mistakes, ${result.summary.total.inaccuracies} inaccuracies`)
    
    return res.json({
      success: true,
      summary: result.summary,
      processingTime: result.processingTime,
      gameCount: result.gameCount,
      detectedUsername: result.detectedUsername
    })
    
  } catch (error) {
    console.error('Analysis error:', error)
    return res.status(500).json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Get server info
app.get('/api/info', (req: any, res: any) => {
  const os = require('os')
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
  console.error('Unhandled error:', err)
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
})
