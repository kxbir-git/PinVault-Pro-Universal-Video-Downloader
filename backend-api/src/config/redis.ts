import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis;
let redisSubscriber: Redis;

export function getRedis(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        // If REDIS_URL is not configured or tried 3 times without luck, stop retrying
        if (!process.env.REDIS_URL || times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      enableOfflineQueue: !!process.env.REDIS_URL,
    });

    redisClient.on('error', (err) => {
      // Only log warning if REDIS_URL was explicitly provided
      if (process.env.REDIS_URL) {
        logger.warn(err, 'Redis connection warning:');
      }
    });
  }
  return redisClient;
}

export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    redisSubscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (!process.env.REDIS_URL || times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
      enableOfflineQueue: !!process.env.REDIS_URL,
    });

    redisSubscriber.on('error', (err) => {
      if (process.env.REDIS_URL) {
        logger.warn(err, 'Redis subscriber warning:');
      }
    });
  }
  return redisSubscriber;
}

export async function connectRedis(): Promise<void> {
  if (!process.env.REDIS_URL) return;
  const client = getRedis();
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    await client.ping();
  } catch (err: any) {
    if (err.message !== 'Redis is already connecting/connected') throw err;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!process.env.REDIS_URL) return null;
  try {
    const client = getRedis();
    const value = await client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    const client = getRedis();
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // degraded mode
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!process.env.REDIS_URL) return;
  try {
    const client = getRedis();
    await client.del(key);
  } catch {
    // degraded mode
  }
}

export async function cacheIncr(key: string, ttlSeconds?: number): Promise<number> {
  if (!process.env.REDIS_URL) return 1;
  try {
    const client = getRedis();
    const count = await client.incr(key);
    if (ttlSeconds && count === 1) {
      await client.expire(key, ttlSeconds);
    }
    return count;
  } catch {
    return 1;
  }
}
