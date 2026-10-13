import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { query, queryOne } from '../db/connection';
import type { User } from '../types';

const router = Router();

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// ── Dashboard stats ───────────────────────────────────
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [users, downloads, revenue] = await Promise.all([
      queryOne<{ total: string; active: string; premium: string }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE tier = 'premium' OR tier = 'enterprise') as premium
        FROM users`),
      queryOne<{ total: string; completed: string; failed: string; today: string }>(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today
        FROM download_jobs`),
      queryOne<{ active_subs: string }>(`
        SELECT COUNT(*) as active_subs FROM subscriptions WHERE status = 'active'`),
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: parseInt(users?.total || '0', 10),
          active: parseInt(users?.active || '0', 10),
          premium: parseInt(users?.premium || '0', 10),
        },
        downloads: {
          total: parseInt(downloads?.total || '0', 10),
          completed: parseInt(downloads?.completed || '0', 10),
          failed: parseInt(downloads?.failed || '0', 10),
          today: parseInt(downloads?.today || '0', 10),
        },
        subscriptions: {
          active: parseInt(revenue?.active_subs || '0', 10),
        },
      },
    });
  } catch (err) { next(err); }
});

// ── List users ────────────────────────────────────────
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '50', search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = '';
    const params: unknown[] = [limitNum, offset];
    if (search) {
      whereClause = `WHERE email ILIKE $3 OR username ILIKE $3 OR display_name ILIKE $3`;
      params.push(`%${search}%`);
    }

    const users = await query(
      `SELECT id, email, username, display_name, role, tier, is_active, is_verified, 
              mfa_enabled, auth_provider, last_login_at, created_at
       FROM users ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      params,
    );

    const total = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      search ? [`%${search}%`] : [],
    );

    res.json({
      success: true,
      data: { users, pagination: { page: pageNum, limit: limitNum, total: parseInt(total?.count || '0', 10) } },
    });
  } catch (err) { next(err); }
});

// ── Ban/unban user ────────────────────────────────────
router.patch('/users/:userId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    await query('UPDATE users SET is_active = $1 WHERE id = $2', [isActive, userId]);
    res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'}` });
  } catch (err) { next(err); }
});

// ── DMCA requests ─────────────────────────────────────
router.get('/dmca', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await query(
      `SELECT * FROM dmca_requests ORDER BY created_at DESC LIMIT 50`,
    );
    res.json({ success: true, data: requests });
  } catch (err) { next(err); }
});

router.patch('/dmca/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const admin = req.user as User;
    const { id } = req.params;
    const { status } = req.body;
    await query(
      `UPDATE dmca_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3`,
      [status, admin.id, id],
    );
    res.json({ success: true, message: 'DMCA request updated' });
  } catch (err) { next(err); }
});

// ── Audit logs ────────────────────────────────────────
router.get('/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const offset = (pageNum - 1) * limitNum;
    const logs = await query(
      `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limitNum, offset],
    );
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
});

export default router;
