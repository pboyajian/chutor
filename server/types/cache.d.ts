type AnalysisSummary = any;
export interface CacheConfig {
    baseDir?: string;
    maxMemoryItems?: number;
    maxDiskBytes?: number;
}
export interface CacheEntryIndex {
    key: string;
    offset: number;
    length: number;
    createdAt: number;
    version: number;
    size: number;
    deleted?: boolean;
}
export interface CacheMetrics {
    memoryItems: number;
    diskEntries: number;
    diskSize: number;
    hits: number;
    misses: number;
    reads: number;
    writes: number;
}
export declare class SummaryCache {
    private dataFile;
    private indexFile;
    private memory;
    private index;
    private metrics;
    private maxDiskBytes;
    private versionMap;
    constructor(cfg?: CacheConfig);
    getMetrics(): CacheMetrics;
    static computeKeyFromDataset(games: any[], options?: {
        onlyForUsername?: string;
        bootstrapOpening?: string;
    }): string;
    getVersion(key: string): number;
    private persistIndex;
    private evictIfNeeded;
    tryGet(key: string): {
        summary: AnalysisSummary;
        createdAt: number;
        version: number;
    } | undefined;
    save(key: string, payload: {
        summary: AnalysisSummary;
        version?: number;
    }): void;
}
export declare const globalSummaryCache: SummaryCache;
export {};
//# sourceMappingURL=cache.d.ts.map