import { Request, Response, NextFunction } from 'express';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../db/connection';
import { getRedis } from '../config/redis';
import { AppError } from '../utils/AppError';
import { sendEmail } from '../utils/email';
import { logger } from '../utils/logger';
import type { User, JwtPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

// ── Token Generation ──────────────────────────────────
function generateAccessToken(user: User): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, tier: user.tier } satisfies JwtPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES as any, issuer: 'pinvaultpro', audience: 'pinvaultpro-client' },
  );
}

function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

async function storeRefreshToken(
  userId: string,
  rawToken: string,
  req: Request,
): Promise<void> {
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hash, req.headers['user-agent'], req.ip, expiresAt],
  );
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('strict' as const) : ('lax' as const),
    path: '/',
  };

  res.cookie('access_token', accessToken, {
    ...cookieOpts,
    maxAge: 15 * 60 * 1000, // 15 min
  });

  res.cookie('refresh_token', refreshToken, {
    ...cookieOpts,
    maxAge: REFRESH_EXPIRES_MS,
    path: '/api/auth/refresh',
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
}

// ── Register ──────────────────────────────────────────
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, displayName } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    // Check existing
    const existing = await queryOne<User>(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail],
    );
    if (existing) throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');

    // Hash password
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Create user
    const user = await queryOne<User>(
      `INSERT INTO users (email, password_hash, display_name, auth_provider)
       VALUES ($1, $2, $3, 'local') RETURNING *`,
      [normalizedEmail, passwordHash, displayName || normalizedEmail.split('@')[0]],
    );

    // Send verification email
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [user!.id, tokenHash],
    );

    await sendEmail({
      to: normalizedEmail,
      subject: 'Verify your PinVault Pro account',
      template: 'email-verify',
      data: {
        name: user!.display_name,
        link: `${process.env.APP_URL}/verify-email?token=${rawToken}`,
      },
    });

    logger.info({ userId: user!.id }, 'User registered');

    res.status(201).json({
      success: true,
      message: 'Account created. Please verify your email.',
      data: { userId: user!.id },
    });
  } catch (err) {
    next(err);
  }
}

// ── Login ─────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as User;

    // Check MFA
    if (user.mfa_enabled) {
      const tempToken = jwt.sign(
        { sub: user.id, purpose: 'mfa' },
        JWT_SECRET,
        { expiresIn: '5m' },
      );
      res.json({ success: true, requiresMfa: true, tempToken });
      return;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken, req);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      data: {
        user: sanitizeUser(user),
        accessToken,
        expiresIn: 900,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── MFA Verify ────────────────────────────────────────
export async function verifyMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tempToken, code } = req.body;

    const decoded = jwt.verify(tempToken, JWT_SECRET) as { sub: string; purpose: string };
    if (decoded.purpose !== 'mfa') throw new AppError('Invalid token', 401);

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1 AND mfa_enabled = true',
      [decoded.sub],
    );
    if (!user) throw new AppError('User not found', 404);

    const secret = decrypt(user.mfa_secret!);
    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) throw new AppError('Invalid MFA code', 401, 'INVALID_MFA');

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken, req);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      data: { user: sanitizeUser(user), accessToken, expiresIn: 900 },
    });
  } catch (err) {
    next(err);
  }
}

// ── OAuth Callback ────────────────────────────────────
export async function oauthCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as User;
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken, req);
    setAuthCookies(res, accessToken, refreshToken);

    res.redirect(`${process.env.APP_URL}/dashboard?login=success`);
  } catch (err) {
    next(err);
  }
}

// ── Refresh Token ─────────────────────────────────────
export async function refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!rawToken) throw new AppError('Refresh token required', 401);

    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenRecord = await queryOne<{ user_id: string; expires_at: string; revoked_at: string }>(
      `SELECT * FROM refresh_tokens 
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [hash],
    );

    if (!tokenRecord) throw new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH');

    const user = await queryOne<User>(
      'SELECT * FROM users WHERE id = $1 AND is_active = true',
      [tokenRecord.user_id],
    );
    if (!user) throw new AppError('User not found', 404);

    // Rotate: revoke old, issue new
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hash]);
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, newRefreshToken, req);
    setAuthCookies(res, newAccessToken, newRefreshToken);

    res.json({ success: true, data: { accessToken: newAccessToken, expiresIn: 900 } });
  } catch (err) {
    next(err);
  }
}

// ── Logout ────────────────────────────────────────────
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.cookies?.refresh_token;
    if (rawToken) {
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [hash]);
    }
    clearAuthCookies(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// ── Verify Email ──────────────────────────────────────
export async function verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.query as { token: string };
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const record = await queryOne<{ user_id: string }>(
      `SELECT * FROM email_verifications 
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [hash],
    );
    if (!record) throw new AppError('Invalid or expired verification link', 400);

    await query('UPDATE users SET is_verified = true WHERE id = $1', [record.user_id]);
    await query('UPDATE email_verifications SET used_at = NOW() WHERE token_hash = $1', [hash]);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
}

// ── MFA Setup ─────────────────────────────────────────
export async function setupMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as User;
    const secret = authenticator.generateSecret(32);
    const encryptedSecret = encrypt(secret);

    // Store temporarily
    await query(
      'UPDATE users SET mfa_secret = $1 WHERE id = $2',
      [encryptedSecret, user.id],
    );

    const otpAuthUrl = authenticator.keyuri(user.email, process.env.MFA_ISSUER || 'PinVault Pro', secret);
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUrl);

    res.json({ success: true, data: { qrCode: qrCodeDataUrl, secret } });
  } catch (err) {
    next(err);
  }
}

// ── MFA Enable ────────────────────────────────────────
export async function enableMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user as User;
    const { code } = req.body;

    if (!user.mfa_secret) throw new AppError('MFA not set up', 400);
    const secret = decrypt(user.mfa_secret);
    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) throw new AppError('Invalid MFA code', 401, 'INVALID_MFA');

    await query('UPDATE users SET mfa_enabled = true WHERE id = $1', [user.id]);
    res.json({ success: true, message: 'MFA enabled successfully' });
  } catch (err) {
    next(err);
  }
}

// ── Forgot Password ───────────────────────────────────
export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    const user = await queryOne<User>(
      `SELECT * FROM users WHERE email = $1 AND auth_provider = 'local'`,
      [email.toLowerCase()],
    );

    // Always return 200 to prevent user enumeration
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [user.id, hash],
      );

      await sendEmail({
        to: user.email,
        subject: 'Reset your PinVault Pro password',
        template: 'password-reset',
        data: {
          name: user.display_name,
          link: `${process.env.APP_URL}/reset-password?token=${rawToken}`,
        },
      });
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// ── Reset Password ────────────────────────────────────
export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = req.body;
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const record = await queryOne<{ user_id: string }>(
      `SELECT * FROM password_resets 
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [hash],
    );
    if (!record) throw new AppError('Invalid or expired reset token', 400);

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
    });

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
    await query('UPDATE password_resets SET used_at = NOW() WHERE token_hash = $1', [hash]);

    // Invalidate all refresh tokens for this user
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1', [record.user_id]);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
}

// ── Helpers ───────────────────────────────────────────
function sanitizeUser(user: User) {
  const { password_hash, mfa_secret, ...safe } = user;
  return safe;
}

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || '', 'utf-8').slice(0, 32);

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(cipherText: string): string {
  const [ivHex, encHex] = cipherText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
