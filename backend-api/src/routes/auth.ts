import { Router } from 'express';
import passport from 'passport';
import { body, query as queryValidator } from 'express-validator';
import { strictRateLimiter } from '../middleware/rateLimit';
import { authenticate } from '../middleware/auth';
import * as auth from '../controllers/authController';

const router = Router();

// ── Register ──────────────────────────────────────────
router.post(
  '/register',
  strictRateLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').isStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1,
  }).withMessage('Password must be at least 8 characters with uppercase, lowercase, number, and symbol'),
  body('displayName').optional().trim().isLength({ min: 2, max: 100 }),
  auth.register,
);

// ── Login ─────────────────────────────────────────────
router.post(
  '/login',
  strictRateLimiter,
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  passport.authenticate('local', { session: false, failWithError: true }),
  auth.login,
);

// ── MFA Verify ────────────────────────────────────────
router.post(
  '/mfa/verify',
  body('tempToken').notEmpty(),
  body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  auth.verifyMfa,
);

// ── MFA Setup/Enable ──────────────────────────────────
router.post('/mfa/setup', authenticate, auth.setupMfa);
router.post(
  '/mfa/enable',
  authenticate,
  body('code').isLength({ min: 6, max: 6 }).isNumeric(),
  auth.enableMfa,
);

// ── Refresh Token ─────────────────────────────────────
router.post('/refresh', auth.refreshToken);

// ── Logout ────────────────────────────────────────────
router.post('/logout', auth.logout);

// ── Email Verification ────────────────────────────────
router.get(
  '/verify-email',
  queryValidator('token').notEmpty().isHexadecimal(),
  auth.verifyEmail,
);

// ── Forgot / Reset Password ──────────────────────────
router.post(
  '/forgot-password',
  strictRateLimiter,
  body('email').isEmail().normalizeEmail(),
  auth.forgotPassword,
);
router.post(
  '/reset-password',
  body('token').notEmpty(),
  body('password').isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 }),
  auth.resetPassword,
);

// ── Google OAuth ──────────────────────────────────────
router.get('/google', passport.authenticate('google', { session: false, scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login?error=google' }), auth.oauthCallback);

// ── Facebook OAuth ────────────────────────────────────
router.get('/facebook', passport.authenticate('facebook', { session: false, scope: ['email'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: '/login?error=facebook' }), auth.oauthCallback);

export default router;
