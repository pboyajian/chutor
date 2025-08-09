import fs from 'fs'
import path from 'path'
import { createGzip, gunzipSync, gzipSync } from 'zlib'
import crypto from 'crypto'

type AnalysisSummary = any

export interface CacheConfig {
  baseDir?: string
  maxMemoryItems?: number
  maxDiskBytes?: number
}

export interface CacheEntryIndex {
  key: string
  offset: number
  length: number
  createdAt: number
  version: number
  size: number
  deleted?: boolean
}

type IndexMap = Record<string, CacheEntryIndex>

class LruMemory<T> {
  private map = new Map<string, T>()
  private max: number
  constructor(max: number) { this.max = Math.max(1, max) }
  get(key: string): T | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }
  set(key: string, value: T) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value
      if (first) this.map.delete(first)
    }
  }
}

export interface CacheMetrics {
  memoryItems: number
  diskEntries: number
  diskSize: number
  hits: number
  misses: number
  reads: number
  writes: number
}

export class SummaryCache {
  private dataFile: string
  private indexFile: string
  private memory: LruMemory<{ summary: AnalysisSummary; createdAt: number; version: number }>
  private index: IndexMap = {}
  private metrics: CacheMetrics = { memoryItems: 0, diskEntries: 0, diskSize: 0, hits: 0, misses: 0, reads: 0, writes: 0 }
  private maxDiskBytes: number
  private versionMap = new Map<string, number>()

  constructor(cfg: CacheConfig = {}) {
    const base = cfg.baseDir || path.resolve(process.cwd(), 'server/cache')
    this.dataFile = path.join(base, 'data.ndjson.gz')
    this.indexFile = path.join(base, 'index.json')
    this.maxDiskBytes = cfg.maxDiskBytes ?? 2 * 1024 * 1024 * 1024 // 2GB
    this.memory = new LruMemory(cfg.maxMemoryItems ?? 100)
    fs.mkdirSync(base, { recursive: true })
    if (!fs.existsSync(this.dataFile)) fs.writeFileSync(this.dataFile, '')
    if (fs.existsSync(this.indexFile)) {
      try {
        const raw = fs.readFileSync(this.indexFile, 'utf8')
        const parsed = JSON.parse(raw)
        this.index = parsed.index || {}
        this.metrics.diskEntries = Object.keys(this.index).length
        this.metrics.diskSize = parsed.diskSize || fs.statSync(this.dataFile).size
        for (const [key, ent] of Object.entries(this.index)) {
          this.versionMap.set(key, (ent as CacheEntryIndex).version)
        }
      } catch {
        this.index = {}
        this.metrics.diskEntries = 0
        this.metrics.diskSize = 0
      }
    }
  }

  getMetrics(): CacheMetrics {
    this.metrics.memoryItems = (this.memory as any).map?.size ?? 0
    return { ...this.metrics }
  }

  static computeKeyFromDataset(games: any[], options: { onlyForUsername?: string; bootstrapOpening?: string } = {}): string {
    const arr = (games || []).map((g: any) => [String(g?.id ?? ''), String(g?.opening?.name ?? 'Unknown'), Array.isArray(g?.analysis) ? g.analysis.length : 0])
    arr.sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
    const payload = { g: arr, o: { onlyForUsername: options.onlyForUsername || '', bootstrapOpening: options.bootstrapOpening || '' } }
    const json = JSON.stringify(payload)
    const hash = crypto.createHash('sha256').update(json).digest('hex')
    return hash
  }

  getVersion(key: string): number {
    return this.versionMap.get(key) ?? 1
  }

  private persistIndex() {
    const diskSize = fs.existsSync(this.dataFile) ? fs.statSync(this.dataFile).size : 0
    fs.writeFileSync(this.indexFile, JSON.stringify({ index: this.index, diskSize }, null, 2))
    this.metrics.diskSize = diskSize
    this.metrics.diskEntries = Object.keys(this.index).length
  }

  private evictIfNeeded() {
    let totalSize = fs.existsSync(this.dataFile) ? fs.statSync(this.dataFile).size : 0
    if (totalSize <= this.maxDiskBytes) return
    // LRU by createdAt from index
    const entries = Object.values(this.index).filter((e) => !e.deleted).sort((a, b) => a.createdAt - b.createdAt)
    for (const ent of entries) {
      ent.deleted = true
      delete this.index[ent.key]
      this.versionMap.delete(ent.key)
      this.persistIndex()
      totalSize = fs.existsSync(this.dataFile) ? fs.statSync(this.dataFile).size : 0
      if (totalSize <= this.maxDiskBytes) break
    }
  }

  tryGet(key: string): { summary: AnalysisSummary; createdAt: number; version: number } | undefined {
    // Memory first
    const mem = this.memory.get(key)
    if (mem) {
      this.metrics.hits += 1
      return mem
    }
    // Disk
    const idx = this.index[key]
    if (!idx) {
      this.metrics.misses += 1
      return undefined
    }
    try {
      const start = Date.now()
      const fd = fs.openSync(this.dataFile, 'r')
      const buf = Buffer.alloc(idx.length)
      fs.readSync(fd, buf, 0, idx.length, idx.offset)
      fs.closeSync(fd)
      const jsonl = gunzipSync(buf).toString('utf8')
      // Each entry is a single JSON line
      const parsed = JSON.parse(jsonl)
      const out = { summary: parsed.summary as AnalysisSummary, createdAt: idx.createdAt, version: idx.version }
      this.memory.set(key, out)
      this.metrics.hits += 1
      this.metrics.reads += 1
      const dur = Date.now() - start
      if (process.env.NODE_ENV !== 'production') console.log(`Cache read: ${dur}ms (key=${key.slice(0,8)})`)
      return out
    } catch (e) {
      this.metrics.misses += 1
      return undefined
    }
  }

  save(key: string, payload: { summary: AnalysisSummary; version?: number }) {
    const createdAt = Date.now()
    const version = payload.version ?? (this.getVersion(key) + 1)
    this.versionMap.set(key, version)
    const json = JSON.stringify({ key, createdAt, version, summary: payload.summary }) + '\n'
    const gz = gzipSync(Buffer.from(json))
    const offset = fs.statSync(this.dataFile).size
    fs.appendFileSync(this.dataFile, gz)
    const entry: CacheEntryIndex = { key, offset, length: gz.length, createdAt, version, size: gz.length }
    this.index[key] = entry
    this.memory.set(key, { summary: payload.summary, createdAt, version })
    this.persistIndex()
    this.metrics.writes += 1
    if (process.env.NODE_ENV !== 'production') console.log(`Cache write: ${gz.length}B @${offset} (key=${key.slice(0,8)})`)
    this.evictIfNeeded()
  }
}

export const globalSummaryCache = new SummaryCache()


