import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis;
let redisSubscriber: Redis;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: true,
    });
    redisClient.on('error', (err) => logger.error(err, 'Redis error:'));
  }
  return redisClient;
}

export function getRedisSubscriber(): Redis {
  if (!redisSubscriber) {
    redisSubscriber = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    redisSubscriber.on('error', (err) => logger.error(err, 'Redis subscriber error:'));
  }
  return redisSubscriber;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
  } catch (err: any) {
    if (err.message !== 'Redis is already connecting/connected') throw err;
  }
  await client.ping();
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  const value = await client.get(key);
  return value ? (JSON.parse(value) as T) : null;
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300,
): Promise<void> {
  const client = getRedis();
  await client.setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  await client.del(key);
}

export async function cacheIncr(key: string, ttlSeconds?: number): Promise<number> {
  const client = getRedis();
  const count = await client.incr(key);
  if (ttlSeconds && count === 1) {
    await client.expire(key, ttlSeconds);
  }
  return count;
}
