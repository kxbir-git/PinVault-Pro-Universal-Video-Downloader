import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import { downloadRateLimiter } from '../middleware/rateLimit';
import * as dl from '../controllers/downloadController';

const router = Router();

// API key or JWT auth
router.use(apiKeyAuth);

// ── Fetch metadata ────────────────────────────────────
router.post(
  '/metadata',
  optionalAuth,
  downloadRateLimiter,
  body('url').isURL().withMessage('Valid URL required'),
  dl.fetchMetadata,
);

// ── Create single download ────────────────────────────
router.post(
  '/',
  optionalAuth,
  downloadRateLimiter,
  body('url').isURL().withMessage('Valid Pinterest URL required'),
  body('format').optional().isIn(['mp4', 'webm', 'mp3']),
  body('quality').optional().isString(),
  body('aiEnhancement').optional().isIn(['none', 'upscale_2x', 'upscale_4x', 'denoise', 'color_correct']),
  body('scheduledAt').optional().isISO8601(),
  dl.createDownload,
);

// ── Batch download ────────────────────────────────────
router.post(
  '/batch',
  authenticate,
  body('urls').isArray({ min: 1, max: 50 }),
  body('urls.*').isURL(),
  body('format').optional().isIn(['mp4', 'webm', 'mp3']),
  dl.createBatchDownload,
);

// ── Get job status ────────────────────────────────────
router.get(
  '/:jobId',
  optionalAuth,
  param('jobId').isUUID(),
  dl.getJobStatus,
);

// ── Get download history ──────────────────────────────
router.get('/', authenticate, dl.getHistory);

export default router;
