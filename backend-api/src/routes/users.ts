import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { queryOne, query } from '../db/connection';
import { AppError } from '../utils/AppError';
import type { User } from '../types';

const router = Router();

// ── Get current user ──────────────────────────────────
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const { password_hash, mfa_secret, ...safe } = user;
    res.json({ success: true, data: safe });
  } catch (err) { next(err); }
});

// ── Update profile ────────────────────────────────────
router.patch(
  '/me',
  authenticate,
  body('displayName').optional().trim().isLength({ min: 2, max: 100 }),
  body('username').optional().trim().isAlphanumeric().isLength({ min: 3, max: 50 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as User;
      const { displayName, username } = req.body;
      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (displayName !== undefined) {
        updates.push(`display_name = $${idx++}`);
        params.push(displayName);
      }
      if (username !== undefined) {
        // Check uniqueness
        const existing = await queryOne('SELECT id FROM users WHERE username = $1 AND id != $2', [username, user.id]);
        if (existing) throw new AppError('Username already taken', 409, 'USERNAME_EXISTS');
        updates.push(`username = $${idx++}`);
        params.push(username);
      }

      if (updates.length === 0) throw new AppError('No fields to update', 400);

      params.push(user.id);
      const updated = await queryOne<User>(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        params,
      );

      const { password_hash, mfa_secret, ...safe } = updated!;
      res.json({ success: true, data: safe });
    } catch (err) { next(err); }
  },
);

// ── Delete account (GDPR) ─────────────────────────────
router.delete('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    await query('UPDATE users SET is_active = false, email = $1 WHERE id = $2', [
      `deleted_${user.id}@deleted.local`,
      user.id,
    ]);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) { next(err); }
});

// ── Export user data (GDPR) ───────────────────────────
router.get('/me/export', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as User;
    const downloads = await query('SELECT * FROM download_jobs WHERE user_id = $1', [user.id]);
    const collections = await query('SELECT * FROM collections WHERE user_id = $1', [user.id]);
    const { password_hash, mfa_secret, ...safe } = user;
    res.json({
      success: true,
      data: { user: safe, downloads, collections },
    });
  } catch (err) { next(err); }
});

export default router;
