import { createClient, RedisClientType } from "redis";

interface CacheMetricsItem {
  key: string;
  ttl: number;
  sizeBytes: number;
}

interface MemoryCacheItem {
  value: any;
  expiresAt: number;
  size: number;
}

class RedisCacheManager {
  private client: RedisClientType | null = null;
  private connecting: Promise<RedisClientType | null> | null = null;
  private memoryCache = new Map<string, MemoryCacheItem>();
  private hits = 0;
  private misses = 0;
  private fallbackHits = 0;
  private fallbackMisses = 0;

  private get redisHost() {
    return process.env.REDIS_HOST;
  }

  private get redisPort() {
    return Number(process.env.REDIS_PORT || 6379);
  }

  private get redisEnabled() {
    return Boolean(this.redisHost);
  }

  private async getClient(): Promise<RedisClientType | null> {
    if (!this.redisEnabled) {
      return null;
    }

    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      try {
        const client = createClient({
          socket: {
            host: this.redisHost,
            port: this.redisPort,
            reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
          },
        }) as RedisClientType;

        client.on("error", (err) => {
          console.error("[Redis] Client error:", err);
        });

        await client.connect();
        this.client = client;
        console.log(`[Redis] Connected to ${this.redisHost}:${this.redisPort}`);
        return client;
      } catch (error) {
        console.error("[Redis] Connection failed. Falling back to in-memory cache.", error);
        this.client = null;
        return null;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  private memoryGet(key: string): any | null {
    const item = this.memoryCache.get(key);
    if (!item) {
      this.fallbackMisses++;
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.memoryCache.delete(key);
      this.fallbackMisses++;
      return null;
    }

    this.fallbackHits++;
    return item.value;
  }

  private memorySet(key: string, value: any, ttlSeconds: number): void {
    const valueString = JSON.stringify(value);
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      size: Buffer.byteLength(valueString),
    });
  }

  async get(key: string): Promise<any | null> {
    const client = await this.getClient();

    if (!client) {
      return this.memoryGet(key);
    }

    try {
      const value = (await client.get(key)) as string | null;
      if (value === null) {
        this.misses++;
        return null;
      }

      this.hits++;
      return JSON.parse(value);
    } catch (error) {
      console.error("[Redis] GET failed. Falling back to memory cache.", error);
      return this.memoryGet(key);
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();

    if (!client) {
      this.memorySet(key, value, ttlSeconds);
      return;
    }

    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error("[Redis] SET failed. Falling back to memory cache.", error);
      this.memorySet(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<boolean> {
    const client = await this.getClient();

    if (!client) {
      return this.memoryCache.delete(key);
    }

    try {
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      console.error("[Redis] DEL failed.", error);
      return false;
    }
  }

  async clear(): Promise<void> {
    const client = await this.getClient();

    this.memoryCache.clear();

    if (!client) {
      return;
    }

    try {
      await client.flushDb();
    } catch (error) {
      console.error("[Redis] FLUSHDB failed.", error);
    }
  }

  async getMetrics() {
    const client = await this.getClient();

    if (!client) {
      const now = Date.now();
      for (const [key, item] of this.memoryCache.entries()) {
        if (now > item.expiresAt) {
          this.memoryCache.delete(key);
        }
      }

      const keys: CacheMetricsItem[] = Array.from(this.memoryCache.entries()).map(([key, item]) => ({
        key,
        ttl: Math.max(0, Math.round((item.expiresAt - now) / 1000)),
        sizeBytes: item.size,
      }));

      return {
        status: "fallback-memory-cache",
        provider: "In-memory Map fallback",
        hits: this.fallbackHits,
        misses: this.fallbackMisses,
        keyCount: keys.length,
        memoryUsedBytes: keys.reduce((sum, item) => sum + item.sizeBytes, 0),
        keys,
      };
    }

    try {
      const keys = (await client.keys("redis:*")) as string[];
      const detail: CacheMetricsItem[] = [];

      for (const key of keys.slice(0, 50)) {
        const ttl = await client.ttl(key);
        const value = (await client.get(key)) as string | null;
        detail.push({
          key,
          ttl,
          sizeBytes: value ? Buffer.byteLength(value) : 0,
        });
      }

      return {
        status: "online",
        provider: "Google Cloud Memorystore for Redis",
        host: this.redisHost,
        port: this.redisPort,
        hits: this.hits,
        misses: this.misses,
        keyCount: keys.length,
        memoryUsedBytes: detail.reduce((sum, item) => sum + item.sizeBytes, 0),
        keys: detail,
      };
    } catch (error) {
      console.error("[Redis] METRICS failed.", error);
      return {
        status: "error",
        provider: "Google Cloud Memorystore for Redis",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const CloudRedisCache = new RedisCacheManager();
