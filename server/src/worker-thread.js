const { parentPort } = require('worker_threads')
const { analyzeGames, deriveUsernameFromGames } = require('../dist/analysis.js')

// Worker thread code
if (parentPort) {
  parentPort.on('message', (message) => {
    if (message.type === 'analyze') {
      try {
        const { games, options, workerId } = message.data
        const startTime = Date.now()
        
        console.log(`🔧 Worker ${workerId}: Starting analysis of ${games.length} games`)
        
        // Auto-detect username if not provided
        const targetUsername = options.onlyForUsername || deriveUsernameFromGames(games)
        if (targetUsername) {
          console.log(`👤 Worker ${workerId}: Detected username: ${targetUsername}`)
        }
        
        // Perform analysis with progress reporting
        const analysisOptions = {}
        if (targetUsername) {
          analysisOptions.onlyForUsername = targetUsername
        }
        
        console.log(`⚙️  Worker ${workerId}: Analyzing games...`)
        const summary = analyzeGames(games, analysisOptions)
        
        const processingTime = Date.now() - startTime
        
        console.log(`✅ Worker ${workerId}: Analysis completed in ${processingTime}ms`)
        console.log(`📊 Worker ${workerId}: Found ${summary.total.blunders} blunders, ${summary.total.mistakes} mistakes, ${summary.total.inaccuracies} inaccuracies`)
        
        const resultData = {
          summary,
          processingTime,
          gameCount: games.length
        }
        
        if (targetUsername) {
          resultData.detectedUsername = targetUsername
        }
        
        parentPort.postMessage({
          type: 'result',
          data: resultData
        })
      } catch (error) {
        console.error(`❌ Worker ${message.data.workerId || 'unknown'}: Analysis failed:`, error)
        parentPort.postMessage({
          type: 'error',
          data: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
      }
    }
  })
}
