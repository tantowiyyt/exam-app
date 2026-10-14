interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private defaultTTL = 60 * 1000; // 1 minute default

  /**
   * Get data from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set data in cache
   */
  set<T>(key: string, data: T, options?: CacheOptions): void {
    const ttl = options?.ttl || this.defaultTTL;
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Delete data from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete all cache entries matching a prefix
   */
  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Singleton instance
export const cache = new MemoryCache();

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
  SHORT: 30 * 1000,      // 30 seconds
  MEDIUM: 60 * 1000,     // 1 minute
  LONG: 5 * 60 * 1000,   // 5 minutes
  VERY_LONG: 30 * 60 * 1000, // 30 minutes
} as const;

// Cache keys
export const CACHE_KEYS = {
  PENGATURAN: 'pengaturan',
  STATS: 'stats',
  SOAL: 'soal',
  UJIAN: 'ujian',
  USERS: 'users',
  STATISTIK_MAPEL: 'statistik-mapel',
  ANALISIS_SOAL: 'analisis-soal',
} as const;