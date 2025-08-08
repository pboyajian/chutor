const { parentPort } = require('worker_threads')
const { analyzeGames, deriveUsernameFromGames } = require('./analysis')

// Worker thread code
if (parentPort) {
  parentPort.on('message', (message) => {
    if (message.type === 'analyze') {
      try {
        const { games, options } = message.data
        const startTime = Date.now()
        
        // Auto-detect username if not provided
        const targetUsername = options.onlyForUsername || deriveUsernameFromGames(games)
        
        // Perform analysis
        const analysisOptions = {}
        if (targetUsername) {
          analysisOptions.onlyForUsername = targetUsername
        }
        const summary = analyzeGames(games, analysisOptions)
        
        const processingTime = Date.now() - startTime
        
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
        parentPort.postMessage({
          type: 'error',
          data: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
      }
    }
  })
}
