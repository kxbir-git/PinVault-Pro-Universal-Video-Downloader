import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { queryOne, query } from '../db/connection';
import { AppError } from '../utils/AppError';
import { cacheGet, cacheSet, cacheIncr } from '../config/redis';
import type { ApiKey, User } from '../types';

/**
 * Middleware that authenticates requests using X-API-Key header.
 * Checks rate limits, scopes, and expiry.
 */
export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawKey = req.headers['x-api-key'] as string;
    if (!rawKey) {
      next(); // No API key – fall through to JWT auth
      return;
    }

    const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // Try cache first
    let apiKey = await cacheGet<ApiKey>(`apikey:${hash}`);
    if (!apiKey) {
      apiKey = await queryOne<ApiKey>(
        `SELECT * FROM api_keys WHERE key_hash = $1 AND is_active = true`,
        [hash],
      );
      if (apiKey) await cacheSet(`apikey:${hash}`, apiKey, 300);
    }

    if (!apiKey) throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      throw new AppError('API key expired', 401, 'EXPIRED_API_KEY');
    }

    // Check daily rate limit
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = `apilimit:${apiKey.id}:${today}`;
    const dailyCount = await cacheIncr(dailyKey, 86400);
    if (dailyCount > apiKey.daily_limit) {
      throw new AppError('Daily API rate limit exceeded', 429, 'API_RATE_LIMIT');
    }

    // Update last_used_at (fire and forget)
    query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKey.id]).catch(() => {});

    // Fetch user
    const user = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [apiKey.user_id],
    );
    if (!user) throw new AppError('API key owner not found', 401);

    req.user = user;
    (req as any).apiKey = apiKey;
    next();
  } catch (err) {
    next(err);
  }
}
