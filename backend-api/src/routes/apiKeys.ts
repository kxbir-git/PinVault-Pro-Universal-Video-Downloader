import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { query, queryOne } from '../db/connection';
import { AppError } from '../utils/AppError';
import type { User, ApiKey } from '../types';

const router = Router();

// ── List user's API keys ──────────────────────────────
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const keys = await query<ApiKey>(
      `SELECT id, name, key_prefix, tier, daily_limit, monthly_limit, scopes, 
              last_used_at, expires_at, is_active, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id],
    );
    res.json({ success: true, data: keys });
  } catch (err) { next(err); }
});

// ── Create API key ────────────────────────────────────
router.post(
  '/',
  authenticate,
  body('name').trim().isLength({ min: 1, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as User;
      const { name } = req.body;

      // Limit keys per user
      const countResult = await queryOne<{ count: string }>(
        'SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND is_active = true',
        [user.id],
      );
      if (parseInt(countResult?.count || '0', 10) >= 5) {
        throw new AppError('Maximum 5 active API keys allowed', 400);
      }

      // Generate key: pvp_XXXXXXXXXXXX
      const rawKey = `pvp_${crypto.randomBytes(32).toString('hex')}`;
      const prefix = rawKey.substring(0, 8);
      const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

      const tierLimits: Record<string, { daily: number; monthly: number }> = {
        free: { daily: 100, monthly: 3000 },
        premium: { daily: 1000, monthly: 30000 },
        enterprise: { daily: 10000, monthly: 300000 },
      };
      const limits = tierLimits[user.tier] || tierLimits.free;

      const key = await queryOne<ApiKey>(
        `INSERT INTO api_keys (user_id, name, key_prefix, key_hash, tier, daily_limit, monthly_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [user.id, name, prefix, hash, user.tier === 'enterprise' ? 'enterprise' : user.tier === 'premium' ? 'pro' : 'free', limits.daily, limits.monthly],
      );

      // Return the raw key ONCE (it's not stored)
      res.status(201).json({
        success: true,
        data: { ...key, rawKey },
        message: 'Save your API key now. It won\'t be shown again.',
      });
    } catch (err) { next(err); }
  },
);

// ── Revoke API key ────────────────────────────────────
router.delete('/:keyId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const { keyId } = req.params;
    const result = await queryOne(
      'UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id',
      [keyId, user.id],
    );
    if (!result) throw new AppError('API key not found', 404);
    res.json({ success: true, message: 'API key revoked' });
  } catch (err) { next(err); }
});

export default router;
