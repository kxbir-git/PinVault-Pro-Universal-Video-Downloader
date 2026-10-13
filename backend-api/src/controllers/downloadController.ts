import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getRedis } from '../config/redis';
import { query, queryOne } from '../db/connection';
import { AppError } from '../utils/AppError';
import { validateVideoUrl } from '../utils/urlValidator';
import { getS3SignedUrl } from '../utils/s3';
import { downloadQueue } from '../workers/downloadWorker';
import { wsEmit } from '../websocket/wsServer';
import { logger } from '../utils/logger';
import type { User, DownloadJob } from '../types';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const PYTHON_API_KEY = process.env.PYTHON_SERVICE_API_KEY!;

const FREE_DAILY_LIMIT = 5;
const BATCH_LIMIT_FREE = 5;
const BATCH_LIMIT_PREMIUM = 50;

// ── Fetch Pinterest Metadata ──────────────────────────
export async function fetchMetadata(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url } = req.body;
    const user = req.user as User | undefined;

    // Validate video URL (SSRF prevention)
    if (!validateVideoUrl(url)) {
      throw new AppError('Invalid video URL. Supported: Pinterest, YouTube, Instagram, Facebook, TikTok, Twitter/X, Reddit, Vimeo.', 400, 'INVALID_URL');
    }

    // Check cache
    const redis = getRedis();
    const cacheKey = `metadata:${Buffer.from(url).toString('base64')}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json({ success: true, data: JSON.parse(cached), cached: true });
      return;
    }

    // Call Python service for metadata
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/metadata`,
      { url },
      {
        headers: { 'X-API-Key': PYTHON_API_KEY },
        timeout: 30000,
      },
    );

    const metadata = response.data;
    await redis.setex(cacheKey, 300, JSON.stringify(metadata)); // 5 min cache

    res.json({ success: true, data: metadata });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      next(new AppError(err.response?.data?.detail || 'Failed to fetch metadata', 502));
    } else {
      next(err);
    }
  }
}

// ── Create Download Job ───────────────────────────────
export async function createDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url, format = 'mp4', quality = 'best', aiEnhancement = 'none', scheduledAt } = req.body;
    const user = req.user as User | undefined;

    // Validate URL
    if (!validateVideoUrl(url)) {
      throw new AppError('Invalid video URL. Supported: Pinterest, YouTube, Instagram, Facebook, TikTok, Twitter/X, Reddit, Vimeo.', 400, 'INVALID_URL');
    }

    // Check daily download limit for free users
    if (user && user.tier === 'free') {
      const today = new Date().toISOString().split('T')[0];
      const countRecord = await queryOne<{ count: string }>(
        `SELECT count FROM daily_download_counts WHERE user_id = $1 AND date = $2`,
        [user.id, today],
      );
      const currentCount = parseInt(countRecord?.count || '0', 10);
      if (currentCount >= FREE_DAILY_LIMIT) {
        throw new AppError(
          `Free tier allows ${FREE_DAILY_LIMIT} downloads per day. Upgrade to premium for unlimited.`,
          429,
          'DAILY_LIMIT_EXCEEDED',
        );
      }
    }

    // AI enhancement only for premium
    if (aiEnhancement !== 'none' && user?.tier === 'free') {
      throw new AppError('AI enhancement requires a premium subscription', 403, 'UPGRADE_REQUIRED');
    }

    // Create job record
    const job = await queryOne<DownloadJob>(
      `INSERT INTO download_jobs 
       (user_id, pinterest_url, format, quality, ai_enhancement, status, scheduled_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        user?.id || null,
        url,
        format,
        quality,
        aiEnhancement,
        scheduledAt ? 'scheduled' : 'pending',
        scheduledAt || null,
        req.ip,
        req.headers['user-agent'],
      ],
    );

    // Increment daily count
    if (user) {
      const today = new Date().toISOString().split('T')[0];
      await query(
        `INSERT INTO daily_download_counts (user_id, date, count)
         VALUES ($1, $2, 1)
         ON CONFLICT (user_id, date) DO UPDATE SET count = daily_download_counts.count + 1`,
        [user.id, today],
      );
    }

    // Queue job (skip if scheduled)
    if (!scheduledAt) {
      await downloadQueue.add(
        'download',
        { jobId: job!.id, url, format, quality, aiEnhancement, userId: user?.id },
        {
          priority: user?.tier === 'free' ? 10 : 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    }

    logger.info({ jobId: job!.id, userId: user?.id }, 'Download job created');

    res.status(202).json({
      success: true,
      message: 'Download job queued',
      data: { jobId: job!.id, status: job!.status },
    });
  } catch (err) {
    next(err);
  }
}

// ── Get Job Status ────────────────────────────────────
export async function getJobStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobId } = req.params;
    const user = req.user as User | undefined;

    const job = await queryOne<DownloadJob>(
      'SELECT * FROM download_jobs WHERE id = $1',
      [jobId],
    );
    if (!job) throw new AppError('Job not found', 404);

    // Authorization: job belongs to user, or job has no user (anonymous)
    if (job.user_id && user && job.user_id !== user.id && user.role !== 'admin') {
      throw new AppError('Unauthorized', 403);
    }

    // Generate fresh signed URL if expired
    if (job.status === 'completed' && job.s3_key) {
      const now = new Date();
      const expiry = job.signed_url_expires ? new Date(job.signed_url_expires) : now;
      if (!job.signed_url || expiry < now) {
        const signedUrl = await getS3SignedUrl(job.s3_key, 3600);
        await query(
          `UPDATE download_jobs 
           SET signed_url = $1, signed_url_expires = NOW() + INTERVAL '1 hour' 
           WHERE id = $2`,
          [signedUrl, job.id],
        );
        job.signed_url = signedUrl;
      }
    }

    res.json({ success: true, data: sanitizeJob(job, user) });
  } catch (err) {
    next(err);
  }
}

// ── Get Download History ──────────────────────────────
export async function getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as User;
    const { page = '1', limit = '20', status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const offset = (pageNum - 1) * limitNum;

    const statusFilter = status ? `AND status = $4` : '';
    const params: unknown[] = [user.id, limitNum, offset];
    if (status) params.push(status);

    const jobs = await query<DownloadJob>(
      `SELECT id, pinterest_url, title, thumbnail_url, format, status, progress, 
              file_size_bytes, ai_enhancement, created_at, completed_at
       FROM download_jobs 
       WHERE user_id = $1 ${statusFilter}
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      params,
    );

    const total = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM download_jobs WHERE user_id = $1`,
      [user.id],
    );

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: parseInt(total?.count || '0', 10),
          pages: Math.ceil(parseInt(total?.count || '0', 10) / limitNum),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Batch Download ────────────────────────────────────
export async function createBatchDownload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { urls, format = 'mp4' } = req.body;
    const user = req.user as User | undefined;

    const limit = user?.tier === 'free' ? BATCH_LIMIT_FREE : BATCH_LIMIT_PREMIUM;
    if (!user) throw new AppError('Authentication required for batch downloads', 401);
    if (urls.length > limit) {
      throw new AppError(`Batch limit is ${limit} URLs for your tier`, 400, 'BATCH_LIMIT_EXCEEDED');
    }

    // Validate all URLs
    const invalidUrls = urls.filter((u: string) => !validateVideoUrl(u));
    if (invalidUrls.length > 0) {
      throw new AppError(`Invalid video URLs: ${invalidUrls.slice(0, 3).join(', ')}`, 400);
    }

    // Create batch job
    const batchJob = await queryOne<{ id: string }>(
      `INSERT INTO batch_jobs (user_id, status, total_count) VALUES ($1, 'pending', $2) RETURNING id`,
      [user.id, urls.length],
    );

    // Create individual download jobs
    const jobPromises = urls.map(async (url: string) => {
      const job = await queryOne<DownloadJob>(
        `INSERT INTO download_jobs (user_id, pinterest_url, format, status, ip_address)
         VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
        [user.id, url, format, req.ip],
      );
      await query(
        `INSERT INTO batch_job_items (batch_job_id, download_job_id, pinterest_url, status)
         VALUES ($1, $2, $3, 'pending')`,
        [batchJob!.id, job!.id, url],
      );
      return job!.id;
    });

    const jobIds = await Promise.all(jobPromises);

    // Queue batch processing
    const { batchQueue } = await import('../workers/batchWorker');
    await batchQueue.add('batch', {
      batchJobId: batchJob!.id,
      jobIds,
      format,
      userId: user.id,
    }, { priority: user.tier === 'free' ? 10 : 1 });

    res.status(202).json({
      success: true,
      data: { batchJobId: batchJob!.id, totalJobs: urls.length },
    });
  } catch (err) {
    next(err);
  }
}

// ── Helpers ───────────────────────────────────────────
function sanitizeJob(job: DownloadJob, user?: User) {
  return {
    id: job.id,
    pinterestUrl: job.pinterest_url,
    title: job.title,
    thumbnailUrl: job.thumbnail_url,
    format: job.format,
    status: job.status,
    progress: job.progress,
    fileSizeBytes: job.file_size_bytes,
    downloadUrl: job.status === 'completed' ? job.signed_url : null,
    aiEnhancement: job.ai_enhancement,
    scheduledAt: job.scheduled_at,
    createdAt: job.created_at,
    completedAt: job.completed_at,
    error: job.error_message,
  };
}
