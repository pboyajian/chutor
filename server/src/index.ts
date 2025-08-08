import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import { analyzeGamesParallel } from './worker'
import { LichessGame, AnalysisRequest } from './types'

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
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

// Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { games, options }: AnalysisRequest = req.body
    
    if (!games || !Array.isArray(games) || games.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request: games array is required and must not be empty' 
      })
    }

    console.log(`Starting analysis of ${games.length} games...`)
    
    // Determine number of workers based on CPU cores and game count
    const numCPUs = require('os').cpus().length
    const numWorkers = Math.min(
      Math.max(2, numCPUs - 1), // Leave one core free
      Math.min(8, Math.ceil(games.length / 1000)) // Max 8 workers, 1 per 1000 games
    )
    
    console.log(`Using ${numWorkers} worker threads for analysis`)
    
    const result = await analyzeGamesParallel(games, options, numWorkers)
    
    console.log(`Analysis completed in ${result.processingTime}ms`)
    console.log(`Found ${result.summary.total.blunders} blunders, ${result.summary.total.mistakes} mistakes, ${result.summary.total.inaccuracies} inaccuracies`)
    
    res.json({
      success: true,
      ...result
    })
    
  } catch (error) {
    console.error('Analysis error:', error)
    res.status(500).json({ 
      error: 'Analysis failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

// Get server info
app.get('/api/info', (req, res) => {
  const os = require('os')
  res.json({
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
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

app.listen(PORT, () => {
  console.log(`🚀 Chutor analysis server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🔍 Analysis endpoint: http://localhost:${PORT}/api/analyze`)
  console.log(`ℹ️  Server info: http://localhost:${PORT}/api/info`)
})
