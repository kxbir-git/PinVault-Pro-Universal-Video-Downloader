import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from '../config/redis';

// Standard API rate limiter
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_FREE_WINDOW_MS || '900000', 10), // 15 min
  max: parseInt(process.env.RATE_LIMIT_FREE_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests, please try again later.',
  },
  keyGenerator: (req) => {
    return (req.user as any)?.id || req.ip || 'anonymous';
  },
  skip: (req) => {
    const user = req.user as any;
    return user?.role === 'admin';
  },
});

// Strict rate limiter for auth endpoints (login, register)
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'TOO_MANY_ATTEMPTS',
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
});

// Download-specific limiter
export const downloadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'DOWNLOAD_RATE_LIMIT',
    message: 'Too many download requests. Please wait a moment.',
  },
  keyGenerator: (req) => (req.user as any)?.id || req.ip || 'anonymous',
});
