import { describe, it, expect } from 'vitest'
import { Worker } from 'worker_threads'

describe('Worker passes options through', () => {
  it('sends bootstrapOpening to analyzer', async () => {
    const worker = new Worker('./src/worker-thread.js')
    const data = await new Promise<any>((resolve, reject) => {
      worker.on('message', (msg: any) => {
        if (msg.type === 'result') resolve(msg.data)
        if (msg.type === 'error') reject(new Error(msg.data?.error || 'error'))
      })
      worker.on('error', reject)
      worker.postMessage({
        type: 'analyze',
        data: { games: [], options: { bootstrapOpening: 'OpZ' }, workerId: 1 },
      })
    })
    expect(data).toBeTruthy()
  })
})


