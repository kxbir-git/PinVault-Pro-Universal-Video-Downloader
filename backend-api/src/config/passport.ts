import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LocalStrategy } from 'passport-local';
import * as argon2 from 'argon2';
import { queryOne } from '../db/connection';
import { logger } from '../utils/logger';
import type { User } from '../types';

export function setupPassport(): void {
  // ── JWT Strategy ──────────────────────────────────
  passport.use(
    'jwt',
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromExtractors([
          // 1. Try HTTP-only cookie first (browser clients)
          (req) => req?.cookies?.access_token ?? null,
          // 2. Fallback to Authorization header (API clients)
          ExtractJwt.fromAuthHeaderAsBearerToken(),
        ]),
        secretOrKey: process.env.JWT_SECRET || 'pinvaultpro_default_jwt_secret_key_2026',
        issuer: 'pinvaultpro',
        audience: 'pinvaultpro-client',
      },
      async (payload, done) => {
        try {
          const user = await queryOne<User>(
            'SELECT * FROM users WHERE id = $1 AND is_active = true',
            [payload.sub],
          );
          if (!user) return done(null, false);
          return done(null, user);
        } catch (err) {
          return done(err, false);
        }
      },
    ),
  );

  // ── Local Strategy (email + password) ─────────────
  passport.use(
    'local',
    new LocalStrategy(
      { usernameField: 'email', passwordField: 'password' },
      async (email, password, done) => {
        try {
          const user = await queryOne<User>(
            `SELECT * FROM users 
             WHERE email = $1 AND auth_provider = 'local' AND is_active = true`,
            [email.toLowerCase()],
          );

          if (!user) return done(null, false, { message: 'Invalid credentials' });

          // Check account lockout
          if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return done(null, false, { message: 'Account temporarily locked' });
          }

          const isValid = await argon2.verify(user.password_hash!, password);
          if (!isValid) {
            // Increment failed attempts
            await queryOne(
              `UPDATE users 
               SET failed_login_attempts = failed_login_attempts + 1,
                   locked_until = CASE WHEN failed_login_attempts + 1 >= 5 
                                       THEN NOW() + INTERVAL '15 minutes' 
                                       ELSE locked_until END
               WHERE id = $1`,
              [user.id],
            );
            return done(null, false, { message: 'Invalid credentials' });
          }

          // Reset failed attempts on success
          await queryOne(
            `UPDATE users 
             SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW()
             WHERE id = $1`,
            [user.id],
          );

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );

  // ── Google OAuth ──────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(
      'google',
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          callbackURL: process.env.GOOGLE_CALLBACK_URL!,
          scope: ['profile', 'email'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('No email from Google'), undefined);

            let user = await queryOne<User>(
              `SELECT * FROM users WHERE auth_provider = 'google' AND provider_id = $1`,
              [profile.id],
            );

            if (!user) {
              // Check if email already exists (merge)
              user = await queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);
              if (!user) {
                // Create new user
                user = await queryOne<User>(
                  `INSERT INTO users (email, display_name, avatar_url, auth_provider, provider_id, is_verified)
                   VALUES ($1, $2, $3, 'google', $4, true) RETURNING *`,
                  [email, profile.displayName, profile.photos?.[0]?.value, profile.id],
                );
              }
            }

            return done(null, user!);
          } catch (err) {
            return done(err as Error, undefined);
          }
        },
      ),
    );
  }

  // ── Facebook OAuth ────────────────────────────────
  if (process.env.FACEBOOK_APP_ID) {
    passport.use(
      'facebook',
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID!,
          clientSecret: process.env.FACEBOOK_APP_SECRET!,
          callbackURL: process.env.FACEBOOK_CALLBACK_URL!,
          profileFields: ['id', 'emails', 'name', 'picture'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('No email from Facebook'), undefined);

            let user = await queryOne<User>(
              `SELECT * FROM users WHERE auth_provider = 'facebook' AND provider_id = $1`,
              [profile.id],
            );

            if (!user) {
              user = await queryOne<User>(
                `INSERT INTO users (email, display_name, auth_provider, provider_id, is_verified)
                 VALUES ($1, $2, 'facebook', $3, true) RETURNING *`,
                [email, `${profile.name?.givenName} ${profile.name?.familyName}`, profile.id],
              );
            }

            return done(null, user!);
          } catch (err) {
            return done(err as Error, undefined);
          }
        },
      ),
    );
  }

  logger.info('✅ Passport strategies configured');
}
